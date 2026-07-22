import type { Job } from "bullmq";
import { runDailyRollup, utcDayBounds } from "@/lib/analytics";
import type { Db } from "@/lib/db";
import { enqueue, getQueue, parseJobPayload } from "@/lib/queue";
import { logger } from "../logger";

/**
 * `metrics-rollup` queue — nightly first-party analytics rollup (spec §10).
 *
 * Folds a UTC day of `analytics_events` into `metrics_daily`. The aggregation
 * itself lives in analytics-core ({@link runDailyRollup}, a composite-PK upsert
 * on `(date, metric, dimension)`); this processor only owns *when* it runs and
 * *for which day*, so re-running any day converges on the same numbers instead
 * of duplicating rows.
 *
 * Three jobs:
 *   - `sweep`      : repeatable nightly tick; rolls up the just-completed UTC day.
 *   - `rollup-day` : roll up one explicit day (the backfill unit; also targeted re-runs).
 *   - `backfill`   : fan out a `rollup-day` for every day in `[start, end]` inclusive,
 *                    so each historical day retries independently.
 */

const DAY_MS = 86_400_000;

/**
 * Guard rail on `backfill`: a fat-fingered range (e.g. year 2000 → today) would
 * otherwise flood the queue with tens of thousands of `rollup-day` jobs. A year
 * of history is a generous ceiling for a manual backfill; larger spans should be
 * run in chunks deliberately.
 */
export const MAX_BACKFILL_DAYS = 400;

/**
 * The UTC calendar day (`YYYY-MM-DD`) immediately before `now`. This is the day
 * the nightly sweep rolls up — by the time it fires (just after midnight UTC)
 * that day is fully closed, so its counts are final. `Date.UTC` normalises the
 * `-1` across month and year boundaries.
 */
export function previousUtcDay(now: Date = new Date()): string {
  const prev = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  return prev.toISOString().slice(0, 10);
}

/**
 * Every UTC day from `start` to `end` inclusive, as `YYYY-MM-DD` strings.
 * Reuses {@link utcDayBounds} for parsing, so a malformed date throws here
 * exactly as it would in the rollup. Rejects a reversed range and any span
 * beyond {@link MAX_BACKFILL_DAYS}. Iterating in UTC milliseconds is exact —
 * UTC has no DST, so each `+ DAY_MS` lands on the next midnight.
 */
export function enumerateUtcDays(start: string, end: string): string[] {
  const { start: from } = utcDayBounds(start);
  const { start: to } = utcDayBounds(end);
  if (to.getTime() < from.getTime()) {
    throw new Error(`enumerateUtcDays: end "${end}" is before start "${start}"`);
  }
  const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (span > MAX_BACKFILL_DAYS) {
    throw new Error(
      `enumerateUtcDays: refusing to backfill ${span} days (max ${MAX_BACKFILL_DAYS}) — run it in chunks`,
    );
  }

  const days: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Injectable seams so the processor is unit-testable without Redis or Postgres:
 * `db` is threaded into the rollup (defaults to the shared pool), `now` fixes the
 * sweep's target day, and `enqueueRollupDay` is the backfill fan-out (defaults to
 * the real queue producer).
 */
export interface MetricsRollupDeps {
  db?: Db;
  now?: Date;
  enqueueRollupDay?: (date: string) => Promise<unknown>;
}

export async function processMetricsRollup(
  job: Job,
  deps: MetricsRollupDeps = {},
): Promise<unknown> {
  if (job.name === "sweep") {
    parseJobPayload("metrics-rollup", "sweep", job.data);
    const date = previousUtcDay(deps.now ?? new Date());
    const rows = await runDailyRollup(date, { db: deps.db });
    logger.info("metrics-rollup sweep complete", {
      jobId: job.id,
      date,
      metrics: rows.length,
    });
    return { date, metrics: rows.length };
  }

  if (job.name === "rollup-day") {
    const { date } = parseJobPayload("metrics-rollup", "rollup-day", job.data);
    const rows = await runDailyRollup(date, { db: deps.db });
    logger.info("metrics-rollup day complete", {
      jobId: job.id,
      date,
      metrics: rows.length,
    });
    return { date, metrics: rows.length };
  }

  if (job.name === "backfill") {
    const { start, end } = parseJobPayload("metrics-rollup", "backfill", job.data);
    const days = enumerateUtcDays(start, end);
    const enqueueRollupDay =
      deps.enqueueRollupDay ??
      ((date: string) => enqueue("metrics-rollup", "rollup-day", { date }));
    for (const date of days) {
      await enqueueRollupDay(date);
    }
    logger.info("metrics-rollup backfill enqueued", {
      jobId: job.id,
      start,
      end,
      days: days.length,
    });
    return { start, end, days: days.length };
  }

  throw new Error(`Unhandled job "${job.name}" on the metrics-rollup queue.`);
}

/**
 * Register the repeatable nightly rollup. Idempotent — BullMQ dedupes a
 * repeatable by its (name, pattern), so re-running on every deploy just
 * refreshes the schedule. Defaults to 00:30 UTC (after the prior UTC day has
 * closed); overridable via `METRICS_ROLLUP_CRON`. Pinned to UTC so correctness
 * does not depend on the worker container's timezone. Called once at worker boot.
 */
export async function scheduleMetricsRollup(): Promise<void> {
  const pattern = process.env.METRICS_ROLLUP_CRON ?? "30 0 * * *";
  await getQueue("metrics-rollup").add(
    "sweep",
    {},
    {
      repeat: { pattern, tz: "UTC" },
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    },
  );
  logger.info("scheduled metrics-rollup sweep", { pattern });
}
