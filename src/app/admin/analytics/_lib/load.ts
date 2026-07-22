/**
 * Data loader for the `/admin/analytics` time-series dashboard (spec §4.1.5).
 *
 * Mirrors the overview's `_lib/overview.ts` assembler pattern: this module owns
 * the *reads*, the page owns the *render*. Every figure is sourced the way the
 * analytics module intends —
 *
 *  - Charted counts that the nightly rollup already defines (signups, listings
 *    created, page views, Meta connections) are read straight from
 *    `metrics_daily` so the page can never drift from the spec §10 metric
 *    definitions. The rollup only writes rows for days that saw an event, so the
 *    sparse rows are projected onto a dense, gap-free axis with the (unit-tested)
 *    {@link ./series} helpers.
 *  - Figures the rollup doesn't define are read raw where needed: leads-per-day
 *    (leads is a domain table, not a rollup metric — the same authoritative
 *    source the overview counts), top listings by leads, and the region
 *    breakdown.
 *
 * Everything takes an explicit `now` + injectable `Db` so the window is
 * deterministic, matching the analytics-core convention.
 */
import { and, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import type { Db } from "@/lib/db";
import { leads, listings, metaConnections, metricsDaily } from "@/lib/db/schema";
import { METRICS, type PeriodDays } from "@/lib/analytics";
import {
  alignDailySeries,
  cumulative,
  enumerateDays,
  spanBounds,
  sum,
  toYmd,
  type DailyRow,
} from "./series";

/** How many rows the categorical (top-listings, region) charts show. */
const TOP_N = 8;

export interface Series {
  /** One value per day in `dayKeys`, zero-filled, oldest → newest. */
  values: number[];
  /** Period total (the panel headline). */
  total: number;
}

export interface SignupSeries {
  /** Total signups per day (all roles). */
  total: number[];
  /** New buyer-role signups per day. */
  buyers: number[];
  /** New seller-role signups per day. */
  sellers: number[];
  /** Period total across all roles. */
  totalCount: number;
}

export interface MetaAdoptionSeries {
  /** Cumulative active Meta connections at each day (adoption curve). */
  cumulative: number[];
  /** New connections added within the period. */
  added: number;
  /** Connections that already existed before the window (the curve's base). */
  base: number;
}

export interface CategoryItem {
  label: string;
  value: number;
  href?: string;
}

export interface AnalyticsData {
  days: PeriodDays;
  /** UTC day keys the every series is aligned to (drives the x-axis). */
  dayKeys: string[];
  signups: SignupSeries;
  listingsCreated: Series;
  leads: Series;
  pageViews: Series;
  metaAdoption: MetaAdoptionSeries;
  topListings: CategoryItem[];
  regions: CategoryItem[];
}

/**
 * Read one rollup metric across the axis, summed per day. `dimension`
 * `undefined` sums every dimension (the metric total); a concrete value (e.g.
 * `"seller"`) selects one breakdown row.
 */
async function metricSeries(
  db: Db,
  metric: string,
  dayKeys: string[],
  dimension?: string,
): Promise<number[]> {
  const first = dayKeys[0];
  const last = dayKeys[dayKeys.length - 1];
  const conds = [
    eq(metricsDaily.metric, metric),
    gte(metricsDaily.date, first),
    lte(metricsDaily.date, last),
  ];
  if (dimension !== undefined) {
    conds.push(eq(metricsDaily.dimension, dimension));
  }
  const rows = await db
    .select({
      date: metricsDaily.date,
      value: sql<number>`sum(${metricsDaily.value})::int`,
    })
    .from(metricsDaily)
    .where(and(...conds))
    .groupBy(metricsDaily.date);
  return alignDailySeries(
    rows.map((r): DailyRow => ({ date: r.date, value: Number(r.value) })),
    dayKeys,
  );
}

/** Signups per day, split into the buyer/seller series (spec §4.1.1 split). */
async function loadSignups(
  db: Db,
  dayKeys: string[],
): Promise<SignupSeries> {
  const [total, buyers, sellers] = await Promise.all([
    metricSeries(db, METRICS.signups, dayKeys),
    metricSeries(db, METRICS.signups, dayKeys, "buyer"),
    metricSeries(db, METRICS.signups, dayKeys, "seller"),
  ]);
  return { total, buyers, sellers, totalCount: sum(total) };
}

/** Cumulative active-connection adoption curve over the window. */
async function loadMetaAdoption(
  db: Db,
  dayKeys: string[],
  start: Date,
  end: Date,
): Promise<MetaAdoptionSeries> {
  // "Connected" reuses the overview's predicate (status = 'active'); the curve
  // is seeded with the connections that already existed before the window so it
  // reads as true cumulative adoption, not just in-window growth from zero.
  const [dailyRows, baseRow] = await Promise.all([
    db
      .select({
        date: sql<string>`to_char(${metaConnections.connectedAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        value: sql<number>`count(*)::int`,
      })
      .from(metaConnections)
      .where(
        and(
          eq(metaConnections.status, "active"),
          gte(metaConnections.connectedAt, start),
          lt(metaConnections.connectedAt, end),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(metaConnections)
      .where(
        and(
          eq(metaConnections.status, "active"),
          lt(metaConnections.connectedAt, start),
        ),
      ),
  ]);

  const added = alignDailySeries(
    dailyRows.map((r): DailyRow => ({ date: r.date, value: Number(r.value) })),
    dayKeys,
  );
  const base = Number(baseRow[0]?.n ?? 0);
  return { cumulative: cumulative(added, base), added: sum(added), base };
}

/** Leads per day over the window — raw (leads is a domain table, not a metric). */
async function loadLeads(
  db: Db,
  dayKeys: string[],
  start: Date,
  end: Date,
): Promise<Series> {
  const rows = await db
    .select({
      date: sql<string>`to_char(${leads.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      value: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(and(gte(leads.createdAt, start), lt(leads.createdAt, end)))
    .groupBy(sql`1`);
  const values = alignDailySeries(
    rows.map((r): DailyRow => ({ date: r.date, value: Number(r.value) })),
    dayKeys,
  );
  return { values, total: sum(values) };
}

/** Top listings by leads received within the window. */
async function loadTopListings(
  db: Db,
  start: Date,
  end: Date,
): Promise<CategoryItem[]> {
  const rows = await db
    .select({
      slug: listings.slug,
      title: listings.title,
      value: sql<number>`count(${leads.id})::int`,
    })
    .from(leads)
    .innerJoin(listings, eq(listings.id, leads.listingId))
    .where(and(gte(leads.createdAt, start), lt(leads.createdAt, end)))
    .groupBy(listings.id, listings.slug, listings.title)
    .orderBy(desc(sql`count(${leads.id})`))
    .limit(TOP_N);
  return rows.map((r) => ({
    label: r.title,
    value: Number(r.value),
    href: `/land/${r.slug}`,
  }));
}

/** Listing count by region across live inventory (spec §4.1.5 geo breakdown). */
async function loadRegions(db: Db): Promise<CategoryItem[]> {
  const rows = await db
    .select({
      region: sql<string>`coalesce(nullif(${listings.region}, ''), 'Unknown')`,
      value: sql<number>`count(*)::int`,
    })
    .from(listings)
    .where(isNull(listings.deletedAt))
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`))
    .limit(TOP_N);
  return rows.map((r) => ({ label: r.region, value: Number(r.value) }));
}

/**
 * Load every analytics panel for a 7/30/90-day window ending at `now`. The
 * axis is the dense list of trailing UTC days; each series is aligned to it so
 * quiet days show as zero rather than as gaps.
 */
export async function loadAnalytics(
  days: PeriodDays,
  now: Date = new Date(),
  db: Db = defaultDb,
): Promise<AnalyticsData> {
  const dayKeys = enumerateDays(toYmd(now), days);
  const { start, end } = spanBounds(dayKeys);

  const [
    signups,
    listingsCreated,
    pageViews,
    metaAdoption,
    leadsSeries,
    topListings,
    regions,
  ] = await Promise.all([
    loadSignups(db, dayKeys),
    metricSeries(db, METRICS.listingsCreated, dayKeys).then((values) => ({
      values,
      total: sum(values),
    })),
    metricSeries(db, METRICS.listingViews, dayKeys).then((values) => ({
      values,
      total: sum(values),
    })),
    loadMetaAdoption(db, dayKeys, start, end),
    loadLeads(db, dayKeys, start, end),
    loadTopListings(db, start, end),
    loadRegions(db),
  ]);

  return {
    days,
    dayKeys,
    signups,
    listingsCreated,
    leads: leadsSeries,
    pageViews,
    metaAdoption,
    topListings,
    regions,
  };
}
