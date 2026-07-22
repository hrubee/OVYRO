import { describe, expect, test } from "bun:test";
import {
  ACTIVE_BUYER_ENGAGEMENT_DAYS,
  ACTIVE_BUYER_SESSION_DAYS,
  META_HEALTHY_DAYS,
  activeBuyerWindows,
  computeFunnel,
  computeTrend,
  median,
  metaHealthySince,
  metricWithTrend,
  resolvePeriod,
  subDays,
  type DateRange,
} from "./metrics";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const DAY_MS = 86_400_000;

describe("subDays", () => {
  test("subtracts whole days without mutating the input", () => {
    const before = NOW.getTime();
    expect(subDays(NOW, 7).getTime()).toBe(before - 7 * DAY_MS);
    expect(NOW.getTime()).toBe(before);
  });
});

describe("resolvePeriod", () => {
  test("current window is the trailing N days ending at now", () => {
    const { current } = resolvePeriod(30, NOW);
    expect(current.end).toEqual(NOW);
    expect(current.start).toEqual(subDays(NOW, 30));
  });

  test("previous window is the equal-length span immediately before current", () => {
    const { current, previous } = resolvePeriod(7, NOW);
    // Back-to-back and non-overlapping: previous.end === current.start.
    expect(previous.end).toEqual(current.start);
    expect(previous.start).toEqual(subDays(NOW, 14));
    const len = (r: DateRange) => r.end.getTime() - r.start.getTime();
    expect(len(previous)).toBe(len(current));
  });

  test("carries the selected period length through", () => {
    expect(resolvePeriod(90, NOW).days).toBe(90);
  });
});

describe("computeTrend", () => {
  test("positive delta trends up with a percentage", () => {
    const t = computeTrend(150, 100);
    expect(t.delta).toBe(50);
    expect(t.pct).toBeCloseTo(50);
    expect(t.direction).toBe("up");
  });

  test("negative delta trends down", () => {
    const t = computeTrend(80, 100);
    expect(t.delta).toBe(-20);
    expect(t.pct).toBeCloseTo(-20);
    expect(t.direction).toBe("down");
  });

  test("equal values are flat", () => {
    const t = computeTrend(42, 42);
    expect(t.direction).toBe("flat");
    expect(t.pct).toBe(0);
  });

  test("growth from zero has no defined percentage (null, not Infinity)", () => {
    const t = computeTrend(10, 0);
    expect(t.pct).toBeNull();
    expect(t.direction).toBe("up");
  });
});

describe("computeFunnel", () => {
  test("conversion is inquiries_submitted / listing_views (spec §10)", () => {
    const f = computeFunnel(1000, 120, 40);
    expect(f.conversionRate).toBeCloseTo(0.04);
    expect(f.startRate).toBeCloseTo(0.12);
    expect(f.submitRate).toBeCloseTo(40 / 120);
  });

  test("rates are null (not divide-by-zero) when a denominator is zero", () => {
    const noViews = computeFunnel(0, 0, 0);
    expect(noViews.conversionRate).toBeNull();
    expect(noViews.startRate).toBeNull();
    expect(noViews.submitRate).toBeNull();

    const viewsNoStarts = computeFunnel(500, 0, 0);
    expect(viewsNoStarts.conversionRate).toBe(0);
    expect(viewsNoStarts.startRate).toBe(0);
    expect(viewsNoStarts.submitRate).toBeNull();
  });
});

describe("active-buyer windows (spec §10)", () => {
  test("session window is 30d, engagement window is 90d", () => {
    expect(ACTIVE_BUYER_SESSION_DAYS).toBe(30);
    expect(ACTIVE_BUYER_ENGAGEMENT_DAYS).toBe(90);
    const { sessionSince, engagementSince } = activeBuyerWindows(NOW);
    expect(sessionSince).toEqual(subDays(NOW, 30));
    expect(engagementSince).toEqual(subDays(NOW, 90));
  });
});

describe("metaHealthySince (spec §10)", () => {
  test("healthy requires an event within the last 7 days", () => {
    expect(META_HEALTHY_DAYS).toBe(7);
    expect(metaHealthySince(NOW)).toEqual(subDays(NOW, 7));
  });
});

describe("median", () => {
  test("null for an empty set", () => {
    expect(median([])).toBeNull();
  });

  test("middle value for an odd count", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  test("mean of the two middle values for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test("does not mutate the caller's array", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("metricWithTrend", () => {
  test("counts current + previous windows and attaches the trend", async () => {
    const period = resolvePeriod(30, NOW);
    const metric = await metricWithTrend(period, async (range) =>
      range === period.current ? 120 : 100,
    );
    expect(metric.current).toBe(120);
    expect(metric.previous).toBe(100);
    expect(metric.trend.direction).toBe("up");
    expect(metric.trend.pct).toBeCloseTo(20);
  });
});
