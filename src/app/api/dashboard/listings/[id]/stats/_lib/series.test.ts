import { describe, expect, test } from "bun:test";
import {
  LONG_WINDOW_DAYS,
  SHORT_WINDOW_DAYS,
  STAT_EVENT_NAMES,
  STAT_EVENT_TO_METRIC,
  buildListingStatsMetrics,
  buildListingStatsResponse,
  lastUtcDays,
  utcDayKey,
  type EventDayBucket,
} from "./series";

// A fixed "now" so day maths is deterministic. Mid-afternoon UTC to prove the
// bucketing keys off the UTC calendar day, not the wall clock.
const NOW = new Date("2026-07-22T15:30:00.000Z");

describe("event → metric mapping", () => {
  test("charts exactly the three funnel events", () => {
    expect(([...STAT_EVENT_NAMES] as string[]).sort()).toEqual([
      "inquiry_submitted",
      "listing_view",
      "save",
    ]);
    expect(STAT_EVENT_TO_METRIC).toEqual({
      listing_view: "views",
      save: "saves",
      inquiry_submitted: "inquiries",
    });
  });
});

describe("lastUtcDays", () => {
  test("returns n UTC days ending on now, oldest → newest", () => {
    expect(lastUtcDays(NOW, 3)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
    ]);
  });

  test("the last element is always today (UTC)", () => {
    const days = lastUtcDays(NOW, LONG_WINDOW_DAYS);
    expect(days).toHaveLength(LONG_WINDOW_DAYS);
    expect(days.at(-1)).toBe(utcDayKey(NOW));
    expect(days[0]).toBe("2026-06-23"); // 29 days before the 22nd
  });

  test("crosses a month boundary correctly", () => {
    const days = lastUtcDays(new Date("2026-03-02T01:00:00.000Z"), 4);
    expect(days).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("buildListingStatsMetrics", () => {
  const totals = { views: 100, saves: 20, inquiries: 5 };

  test("uses denormalized counters for all-time totals", () => {
    const metrics = buildListingStatsMetrics({ buckets: [], totals, now: NOW });
    expect(metrics.views.total).toBe(100);
    expect(metrics.saves.total).toBe(20);
    expect(metrics.inquiries.total).toBe(5);
  });

  test("zero-fills every day when there are no events", () => {
    const { views } = buildListingStatsMetrics({ buckets: [], totals, now: NOW });
    expect(views.daily30).toHaveLength(LONG_WINDOW_DAYS);
    expect(views.daily7).toHaveLength(SHORT_WINDOW_DAYS);
    expect(views.daily30.every((p) => p.value === 0)).toBe(true);
    expect(views.last7).toBe(0);
    expect(views.last30).toBe(0);
  });

  test("buckets land on their UTC day and route to the right metric", () => {
    const buckets: EventDayBucket[] = [
      { date: "2026-07-22", eventName: "listing_view", count: 4 },
      { date: "2026-07-21", eventName: "listing_view", count: 3 },
      { date: "2026-07-22", eventName: "save", count: 2 },
      { date: "2026-07-22", eventName: "inquiry_submitted", count: 1 },
    ];
    const { views, saves, inquiries } = buildListingStatsMetrics({
      buckets,
      totals,
      now: NOW,
    });

    expect(views.daily30.at(-1)).toEqual({ date: "2026-07-22", value: 4 });
    expect(views.daily30.at(-2)).toEqual({ date: "2026-07-21", value: 3 });
    expect(views.last7).toBe(7);
    expect(views.last30).toBe(7);
    expect(saves.last7).toBe(2);
    expect(inquiries.last7).toBe(1);
  });

  test("sums duplicate (day, event) buckets rather than overwriting", () => {
    const buckets: EventDayBucket[] = [
      { date: "2026-07-22", eventName: "listing_view", count: 4 },
      { date: "2026-07-22", eventName: "listing_view", count: 6 },
    ];
    const { views } = buildListingStatsMetrics({ buckets, totals, now: NOW });
    expect(views.daily30.at(-1)?.value).toBe(10);
  });

  test("7-day window is the tail of the 30-day window", () => {
    const buckets: EventDayBucket[] = [
      // Inside 30d but outside 7d (10 days ago).
      { date: "2026-07-12", eventName: "listing_view", count: 9 },
      // Inside both windows (today).
      { date: "2026-07-22", eventName: "listing_view", count: 1 },
    ];
    const { views } = buildListingStatsMetrics({ buckets, totals, now: NOW });
    expect(views.last30).toBe(10);
    expect(views.last7).toBe(1);
    expect(views.daily7).toEqual(views.daily30.slice(LONG_WINDOW_DAYS - SHORT_WINDOW_DAYS));
  });

  test("drops events older than the 30-day window", () => {
    const buckets: EventDayBucket[] = [
      { date: "2026-06-01", eventName: "listing_view", count: 50 }, // > 30d ago
    ];
    const { views } = buildListingStatsMetrics({ buckets, totals, now: NOW });
    expect(views.last30).toBe(0);
    expect(views.daily30.some((p) => p.date === "2026-06-01")).toBe(false);
  });

  test("ignores event names outside the charted set", () => {
    const buckets: EventDayBucket[] = [
      { date: "2026-07-22", eventName: "meta_connected", count: 99 },
    ];
    const { views, saves, inquiries } = buildListingStatsMetrics({
      buckets,
      totals,
      now: NOW,
    });
    expect(views.last30 + saves.last30 + inquiries.last30).toBe(0);
  });
});

describe("buildListingStatsResponse", () => {
  test("shapes the full payload from a listing row", () => {
    const listing = {
      id: "listing_1",
      slug: "ten-acre-plot",
      title: "Ten Acre Plot",
      viewCount: 42,
      saveCount: 7,
      leadCount: 3,
    };
    const res = buildListingStatsResponse({ listing, buckets: [], now: NOW });
    expect(res).toMatchObject({
      listingId: "listing_1",
      slug: "ten-acre-plot",
      title: "Ten Acre Plot",
      generatedAt: NOW.toISOString(),
    });
    expect(res.metrics.views.total).toBe(42);
    expect(res.metrics.saves.total).toBe(7);
    expect(res.metrics.inquiries.total).toBe(3);
  });
});
