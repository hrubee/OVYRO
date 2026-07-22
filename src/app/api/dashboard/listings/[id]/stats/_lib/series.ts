/**
 * Pure, DB-free assembly of a listing's stats payload (spec §4.3.1 per-listing
 * stats, §10 analytics).
 *
 * The route + dashboard page both feed the same three inputs — the listing's
 * denormalized counters (all-time totals), the per-day event counts from
 * `analytics_events`, and "now" — through {@link buildListingStatsResponse},
 * so the JSON API and the server-rendered page can never disagree. Keeping the
 * bucketing here (rather than in SQL or the component) makes the zero-fill and
 * window maths trivially unit-testable without a database.
 */
import type { AnalyticsEventName } from "@/lib/analytics";

export type StatMetricKey = "views" | "saves" | "inquiries";

/**
 * The three funnel events charted per listing → their metric key. Keyed by
 * {@link AnalyticsEventName} via `satisfies`, so renaming an event in the
 * analytics union breaks the build here instead of silently emptying a chart.
 */
export const STAT_EVENT_TO_METRIC = {
  listing_view: "views",
  save: "saves",
  inquiry_submitted: "inquiries",
} satisfies Partial<Record<AnalyticsEventName, StatMetricKey>>;

export type StatEventName = keyof typeof STAT_EVENT_TO_METRIC;

/** The event names to filter on when querying the time series. */
export const STAT_EVENT_NAMES = Object.keys(
  STAT_EVENT_TO_METRIC,
) as StatEventName[];

export const SHORT_WINDOW_DAYS = 7;
export const LONG_WINDOW_DAYS = 30;

/** One aggregated (day, event) count from `analytics_events`, grouped in SQL. */
export interface EventDayBucket {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  eventName: string;
  count: number;
}

/** A single point on a metric sparkline. */
export interface StatPoint {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  value: number;
}

export interface StatMetricDTO {
  /** All-time total from the listing's denormalized counter. */
  total: number;
  /** Sum of the last 7 daily buckets. */
  last7: number;
  /** Sum of the last 30 daily buckets. */
  last30: number;
  /** 7 daily points, oldest → newest, zero-filled. */
  daily7: StatPoint[];
  /** 30 daily points, oldest → newest, zero-filled. */
  daily30: StatPoint[];
}

export interface ListingStatsMetrics {
  views: StatMetricDTO;
  saves: StatMetricDTO;
  inquiries: StatMetricDTO;
}

export interface ListingStatsResponse {
  listingId: string;
  slug: string;
  title: string;
  /** ISO-8601 timestamp the series was computed at (its right edge). */
  generatedAt: string;
  metrics: ListingStatsMetrics;
}

/** Minimal listing shape the payload needs — `ListingRow` satisfies it. */
export interface StatsListing {
  id: string;
  slug: string;
  title: string;
  viewCount: number;
  saveCount: number;
  leadCount: number;
}

const DAY_MS = 86_400_000;

/** Midnight-UTC `YYYY-MM-DD` for a Date. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last `n` UTC calendar days ending on `now`, oldest → newest. */
export function lastUtcDays(now: Date, n: number): string[] {
  const todayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(todayStart - i * DAY_MS).toISOString().slice(0, 10));
  }
  return days;
}

function sum(points: StatPoint[]): number {
  return points.reduce((acc, p) => acc + p.value, 0);
}

/** Build one metric's windows from a `day → count` map + all-time total. */
function metricSeries(
  countsByDay: Map<string, number>,
  total: number,
  now: Date,
): StatMetricDTO {
  const daily30 = lastUtcDays(now, LONG_WINDOW_DAYS).map((date) => ({
    date,
    value: countsByDay.get(date) ?? 0,
  }));
  // The 7-day window is the tail of the 30-day one, so the two can never drift.
  const daily7 = daily30.slice(daily30.length - SHORT_WINDOW_DAYS);
  return {
    total,
    last7: sum(daily7),
    last30: sum(daily30),
    daily7,
    daily30,
  };
}

/** Fold the raw event buckets into per-metric daily count maps. */
function bucketsByMetric(
  buckets: EventDayBucket[],
): Record<StatMetricKey, Map<string, number>> {
  const byMetric: Record<StatMetricKey, Map<string, number>> = {
    views: new Map(),
    saves: new Map(),
    inquiries: new Map(),
  };
  for (const bucket of buckets) {
    const metric = STAT_EVENT_TO_METRIC[bucket.eventName as StatEventName];
    // Defensive: ignore any event that isn't one of the three we chart.
    if (!metric) continue;
    const map = byMetric[metric];
    map.set(bucket.date, (map.get(bucket.date) ?? 0) + bucket.count);
  }
  return byMetric;
}

export function buildListingStatsMetrics(params: {
  buckets: EventDayBucket[];
  totals: { views: number; saves: number; inquiries: number };
  now: Date;
}): ListingStatsMetrics {
  const { buckets, totals, now } = params;
  const byMetric = bucketsByMetric(buckets);
  return {
    views: metricSeries(byMetric.views, totals.views, now),
    saves: metricSeries(byMetric.saves, totals.saves, now),
    inquiries: metricSeries(byMetric.inquiries, totals.inquiries, now),
  };
}

/** Assemble the full per-listing stats payload shared by the API + page. */
export function buildListingStatsResponse(params: {
  listing: StatsListing;
  buckets: EventDayBucket[];
  now: Date;
}): ListingStatsResponse {
  const { listing, buckets, now } = params;
  return {
    listingId: listing.id,
    slug: listing.slug,
    title: listing.title,
    generatedAt: now.toISOString(),
    metrics: buildListingStatsMetrics({
      buckets,
      totals: {
        views: listing.viewCount,
        saves: listing.saveCount,
        inquiries: listing.leadCount,
      },
      now,
    }),
  };
}
