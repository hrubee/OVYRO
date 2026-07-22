import { describe, expect, test } from "bun:test";
import type { Job } from "bullmq";
import type { Db } from "@/lib/db";
import type { MetricRow, RollupEvent } from "@/lib/analytics";
import {
  enumerateUtcDays,
  previousUtcDay,
  processMetricsRollup,
} from "./metrics-rollup";

function makeJob(name: string, data: unknown): Job {
  return { name, id: `job-${name}`, data } as unknown as Job;
}

/**
 * Stubs the drizzle chains `runDailyRollup` walks: `select().from().where()`
 * resolves to the seeded events, and `insert().values().onConflictDoUpdate()`
 * records every write so the test can prove it upserts rather than appends. No
 * Redis, no Postgres — mirrors the `fakeDb()` seam in track.test.ts.
 */
function fakeRollupDb(events: RollupEvent[]) {
  const inserts: Array<{ rows: MetricRow[]; conflict: { target?: unknown } }> = [];
  const eventRows = events.map((e) => ({ eventName: e.eventName, props: e.props ?? null }));
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(eventRows),
      }),
    }),
    insert: () => ({
      values: (rows: MetricRow[]) => ({
        onConflictDoUpdate: (conflict: { target?: unknown }) => {
          inserts.push({ rows, conflict });
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Db;
  return { db, inserts };
}

describe("previousUtcDay", () => {
  test("returns yesterday in UTC", () => {
    expect(previousUtcDay(new Date("2026-07-22T13:45:00.000Z"))).toBe("2026-07-21");
  });

  test("just after midnight UTC yields the day that just closed", () => {
    expect(previousUtcDay(new Date("2026-07-22T00:00:30.000Z"))).toBe("2026-07-21");
  });

  test("rolls back across a month boundary", () => {
    expect(previousUtcDay(new Date("2026-08-01T00:30:00.000Z"))).toBe("2026-07-31");
  });

  test("rolls back across a year boundary", () => {
    expect(previousUtcDay(new Date("2026-01-01T06:00:00.000Z"))).toBe("2025-12-31");
  });
});

describe("enumerateUtcDays", () => {
  test("a single day yields just that day", () => {
    expect(enumerateUtcDays("2026-07-22", "2026-07-22")).toEqual(["2026-07-22"]);
  });

  test("an inclusive range spans a month boundary", () => {
    expect(enumerateUtcDays("2026-07-30", "2026-08-02")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  test("throws when end precedes start", () => {
    expect(() => enumerateUtcDays("2026-07-22", "2026-07-21")).toThrow(/before start/);
  });

  test("throws on a malformed date (delegates to utcDayBounds)", () => {
    expect(() => enumerateUtcDays("2026-7-2", "2026-07-22")).toThrow();
  });

  test("refuses a span beyond the backfill cap", () => {
    expect(() => enumerateUtcDays("2020-01-01", "2026-07-22")).toThrow(/refusing to backfill/);
  });
});

describe("processMetricsRollup", () => {
  test("rollup-day upserts the day's metrics and re-runs converge (idempotent)", async () => {
    const events: RollupEvent[] = [
      { eventName: "listing_view" },
      { eventName: "listing_view" },
      { eventName: "inquiry_submitted" },
      { eventName: "signup", props: { role: "seller" } },
    ];
    const { db, inserts } = fakeRollupDb(events);
    const job = makeJob("rollup-day", { date: "2026-07-22" });

    const first = await processMetricsRollup(job, { db });
    const second = await processMetricsRollup(job, { db });

    // Same input → identical result every run: the mark of idempotency.
    expect(first).toEqual(second);
    expect(first).toEqual({ date: "2026-07-22", metrics: 3 });

    // Every write goes through onConflictDoUpdate on the composite key — a re-run
    // replaces the day's rows in place, it never appends duplicates.
    expect(inserts).toHaveLength(2);
    for (const ins of inserts) {
      expect(Array.isArray((ins.conflict as { target?: unknown[] }).target)).toBe(true);
      expect(ins.rows.every((r) => r.date === "2026-07-22")).toBe(true);
    }
  });

  test("an empty day writes nothing and reports zero metrics", async () => {
    const { db, inserts } = fakeRollupDb([]);
    const result = await processMetricsRollup(
      makeJob("rollup-day", { date: "2026-07-22" }),
      { db },
    );
    expect(result).toEqual({ date: "2026-07-22", metrics: 0 });
    expect(inserts).toHaveLength(0);
  });

  test("sweep rolls up the previous UTC day", async () => {
    const { db, inserts } = fakeRollupDb([{ eventName: "save" }]);
    const now = new Date("2026-07-22T00:30:00.000Z");
    const result = await processMetricsRollup(makeJob("sweep", {}), { db, now });
    expect(result).toEqual({ date: "2026-07-21", metrics: 1 });
    expect(inserts[0].rows[0].date).toBe("2026-07-21");
  });

  test("backfill fans out one rollup-day per day in the inclusive range", async () => {
    const enqueued: string[] = [];
    const result = await processMetricsRollup(
      makeJob("backfill", { start: "2026-07-01", end: "2026-07-03" }),
      {
        enqueueRollupDay: (date) => {
          enqueued.push(date);
          return Promise.resolve();
        },
      },
    );
    expect(enqueued).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(result).toEqual({ start: "2026-07-01", end: "2026-07-03", days: 3 });
  });

  test("rejects an unhandled job name", async () => {
    await expect(processMetricsRollup(makeJob("nope", {}), {})).rejects.toThrow(/Unhandled job/);
  });
});
