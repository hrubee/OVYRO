import { describe, expect, test } from "bun:test";
import { METRICS } from "./events";
import { rollupEvents, utcDayBounds, type RollupEvent } from "./rollup";

const DATE = "2026-07-22";

describe("rollupEvents", () => {
  test("empty input yields no rows", () => {
    expect(rollupEvents(DATE, [])).toEqual([]);
  });

  test("counts each event into its mapped daily metric", () => {
    const events: RollupEvent[] = [
      { eventName: "listing_view" },
      { eventName: "listing_view" },
      { eventName: "listing_view" },
      { eventName: "inquiry_submitted" },
      { eventName: "listing_created" },
    ];
    const rows = rollupEvents(DATE, events);
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    expect(byMetric[METRICS.listingViews]).toBe(3);
    expect(byMetric[METRICS.inquiriesSubmitted]).toBe(1);
    expect(byMetric[METRICS.listingsCreated]).toBe(1);
  });

  test("stamps every row with the given date and '' dimension by default", () => {
    const rows = rollupEvents(DATE, [{ eventName: "save" }]);
    expect(rows).toEqual([
      { date: DATE, metric: METRICS.saves, dimension: "", value: 1 },
    ]);
  });

  test("splits signups by role into separate dimensioned rows", () => {
    const events: RollupEvent[] = [
      { eventName: "signup", props: { role: "buyer" } },
      { eventName: "signup", props: { role: "buyer" } },
      { eventName: "signup", props: { role: "seller" } },
      { eventName: "signup", props: {} },
      { eventName: "signup", props: null },
    ];
    const signups = rollupEvents(DATE, events).filter(
      (r) => r.metric === METRICS.signups,
    );
    const byDim = Object.fromEntries(signups.map((r) => [r.dimension, r.value]));
    expect(byDim).toEqual({ buyer: 2, seller: 1, unknown: 2 });
    // Total signups = SUM across dimension rows, never a separate '' total.
    expect(signups.some((r) => r.dimension === "")).toBe(false);
  });

  test("ignores event names outside the closed analytics union", () => {
    const rows = rollupEvents(DATE, [
      { eventName: "listing_view" },
      { eventName: "totally_made_up" },
      { eventName: "" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe(METRICS.listingViews);
  });

  test("output is deterministically ordered by (metric, dimension)", () => {
    const events: RollupEvent[] = [
      { eventName: "signup", props: { role: "seller" } },
      { eventName: "signup", props: { role: "buyer" } },
      { eventName: "listing_view" },
      { eventName: "meta_connected" },
    ];
    const rows = rollupEvents(DATE, events);
    const keys = rows.map((r) => `${r.metric}/${r.dimension}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("utcDayBounds", () => {
  test("returns the half-open UTC day [00:00, next 00:00)", () => {
    const { start, end } = utcDayBounds("2026-07-22");
    expect(start.toISOString()).toBe("2026-07-22T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  test("rolls over month boundaries correctly", () => {
    const { start, end } = utcDayBounds("2026-01-31");
    expect(start.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("throws on a malformed date rather than guessing", () => {
    expect(() => utcDayBounds("2026-7-2")).toThrow();
    expect(() => utcDayBounds("not-a-date")).toThrow();
  });
});
