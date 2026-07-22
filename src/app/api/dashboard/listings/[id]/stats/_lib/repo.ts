/**
 * Read-only analytics access for per-listing stats (task OVYRO-f4a9).
 *
 * The all-time totals come from the listing's denormalized counters (read by
 * the caller via the shared listings repo); this module only owns the time
 * series. Counts are aggregated in SQL — grouped by UTC calendar day + event —
 * so a popular listing never streams thousands of raw event rows into the app.
 * Days with no events are simply absent; {@link buildListingStatsResponse}
 * zero-fills them.
 *
 * `analytics_events` is append-only and read-only here — this feature never
 * writes to it (event emission is owned by the public/leads builders).
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { analyticsEvents } from "@/lib/db/schema";
import {
  LONG_WINDOW_DAYS,
  STAT_EVENT_NAMES,
  type EventDayBucket,
} from "./series";

const DAY_MS = 86_400_000;

/**
 * Midnight UTC, `LONG_WINDOW_DAYS - 1` days before `now` — the inclusive floor
 * of the 30-day window, matching the earliest day the series builder renders.
 */
export function windowStart(now: Date): Date {
  const todayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(todayStart - (LONG_WINDOW_DAYS - 1) * DAY_MS);
}

/** The UTC calendar day of an `occurred_at` timestamptz, as `YYYY-MM-DD`. */
const dayBucket = sql`date_trunc('day', ${analyticsEvents.occurredAt} at time zone 'UTC')`;

/**
 * Per-day counts of the three charted funnel events for one listing, from
 * `since` (inclusive). Returned oldest-first is not guaranteed — the pure
 * series builder keys by date, so order does not matter.
 */
export async function getListingEventBuckets(
  db: Db,
  listingId: string,
  since: Date,
): Promise<EventDayBucket[]> {
  const rows = await db
    .select({
      date: sql<string>`to_char(${dayBucket}, 'YYYY-MM-DD')`,
      eventName: analyticsEvents.eventName,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.listingId, listingId),
        inArray(analyticsEvents.eventName, [...STAT_EVENT_NAMES]),
        gte(analyticsEvents.occurredAt, since),
      ),
    )
    .groupBy(dayBucket, analyticsEvents.eventName);

  return rows.map((row) => ({
    date: row.date,
    eventName: row.eventName,
    count: Number(row.count),
  }));
}
