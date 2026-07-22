import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import type { Db } from "@/lib/db";
import {
  analyticsEvents,
  leads,
  listItems,
  listings,
  listingStatus,
  lists,
  metaConnections,
  sessions,
  userRoles,
  users,
} from "@/lib/db/schema";

/**
 * Admin metric definitions (spec §10, §4.1.1). The point of this module is that
 * "unambiguous" is enforced in one place: the definitional maths — period
 * windows, trend vs. previous period, funnel conversion, the active-buyer and
 * Meta-healthy time windows, medians — are extracted into pure, unit-tested
 * helpers, and the DB query functions merely feed them counts. So the overview
 * card, the analytics charts, and any ad-hoc report all agree on what an
 * "active buyer" or a "healthy connection" is.
 *
 * Every DB function takes an injectable `Db` (defaulting to the shared pool)
 * and, where a window is involved, an explicit `now`, so callers are
 * deterministic and the maths is testable without a database.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Pure definitional helpers (spec §10) — no DB, exhaustively unit-tested.
// ---------------------------------------------------------------------------

/** The admin period selector (spec §4.1.1): trailing 7 / 30 / 90 days. */
export const PERIOD_DAYS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_DAYS)[number];

/** A half-open time window `[start, end)`. */
export interface DateRange {
  start: Date;
  end: Date;
}

export interface Period {
  days: PeriodDays;
  /** The trailing window ending at `now`. */
  current: DateRange;
  /** The window immediately before `current`, of equal length, for trends. */
  previous: DateRange;
}

/** `now` shifted back `days` days. */
export function subDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Resolve the current + previous windows for a period selector. Windows are
 * half-open and back-to-back — `previous.end === current.start` — so no day is
 * counted in both and "trend vs. previous period" compares equal-length spans.
 */
export function resolvePeriod(days: PeriodDays, now: Date): Period {
  const current: DateRange = { start: subDays(now, days), end: now };
  const previous: DateRange = {
    start: subDays(now, days * 2),
    end: current.start,
  };
  return { days, current, previous };
}

export type TrendDirection = "up" | "down" | "flat";

export interface Trend {
  current: number;
  previous: number;
  /** `current - previous`. */
  delta: number;
  /**
   * Percent change vs. the previous period, or `null` when the previous period
   * was zero — growth from nothing has no defined percentage (the UI shows
   * "new" rather than "+∞%").
   */
  pct: number | null;
  direction: TrendDirection;
}

/** Trend of a headline count vs. the previous equal-length period. */
export function computeTrend(current: number, previous: number): Trend {
  const delta = current - previous;
  const direction: TrendDirection =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const pct = previous === 0 ? null : (delta / previous) * 100;
  return { current, previous, delta, pct, direction };
}

export interface Funnel {
  views: number;
  inquiryStarts: number;
  inquiriesSubmitted: number;
  /** `starts / views`, or `null` when there were no views. */
  startRate: number | null;
  /** `submitted / starts`, or `null` when there were no starts. */
  submitRate: number | null;
  /**
   * The spec §10 headline: `inquiries_submitted / listing_views`. `null` when
   * there were no views (an undefined ratio, not 0%).
   */
  conversionRate: number | null;
}

/** Funnel rates from the three period-scoped event counts (spec §10, §4.1.1). */
export function computeFunnel(
  views: number,
  inquiryStarts: number,
  inquiriesSubmitted: number,
): Funnel {
  return {
    views,
    inquiryStarts,
    inquiriesSubmitted,
    startRate: views === 0 ? null : inquiryStarts / views,
    submitRate: inquiryStarts === 0 ? null : inquiriesSubmitted / inquiryStarts,
    conversionRate: views === 0 ? null : inquiriesSubmitted / views,
  };
}

/** "Active buyer" lookback (spec §10): session in 30d OR inquiry/save in 90d. */
export const ACTIVE_BUYER_SESSION_DAYS = 30;
export const ACTIVE_BUYER_ENGAGEMENT_DAYS = 90;

export function activeBuyerWindows(now: Date): {
  sessionSince: Date;
  engagementSince: Date;
} {
  return {
    sessionSince: subDays(now, ACTIVE_BUYER_SESSION_DAYS),
    engagementSince: subDays(now, ACTIVE_BUYER_ENGAGEMENT_DAYS),
  };
}

/** A Meta connection is "healthy" only if it sent an event within 7d (spec §10). */
export const META_HEALTHY_DAYS = 7;

export function metaHealthySince(now: Date): Date {
  return subDays(now, META_HEALTHY_DAYS);
}

/**
 * Median of a value set (spec §4.1.1 "leads per listing (median)"). `null` for
 * an empty set; the mean of the two middle values for an even count.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ---------------------------------------------------------------------------
// DB query functions — thin wrappers that feed the pure helpers above.
// ---------------------------------------------------------------------------

export type ListingStatus = (typeof listingStatus.enumValues)[number];

export interface RegisteredUsers {
  /** All non-deleted accounts. */
  total: number;
  /** Accounts carrying the additive `seller` role (spec §3.1). */
  sellers: number;
  /** `total - sellers` — accounts that are buyers only. */
  buyersOnly: number;
}

/** Count of accounts with the `seller` role (non-deleted). */
async function countSellers(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "seller"), isNull(users.deletedAt)));
  return Number(row?.n ?? 0);
}

/** Total registered users, split buyers-only vs. sellers (spec §4.1.1). */
export async function getRegisteredUsers(
  db: Db = defaultDb,
): Promise<RegisteredUsers> {
  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(isNull(users.deletedAt));
  const total = Number(totalRow?.n ?? 0);
  const sellers = await countSellers(db);
  return { total, sellers, buyersOnly: total - sellers };
}

export interface ActiveBuyers {
  /** All non-deleted accounts (the "registered total" shown beside "active"). */
  registered: number;
  /** Accounts meeting the spec §10 active-buyer definition. */
  active: number;
}

/**
 * Registered total + active buyers (spec §10): a user is active with ≥1 session
 * active in the last 30d OR ≥1 inquiry (as buyer) or save in the last 90d. The
 * three id sets are `UNION`-ed (so a user active on several signals counts
 * once) and counted.
 */
export async function getActiveBuyers(
  db: Db = defaultDb,
  now: Date = new Date(),
): Promise<ActiveBuyers> {
  const { sessionSince, engagementSince } = activeBuyerWindows(now);

  const [registeredRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(isNull(users.deletedAt));

  const result = await db.execute(sql`
    select count(*)::int as active from (
      select ${sessions.userId} as id
        from ${sessions}
        where ${sessions.updatedAt} >= ${sessionSince}
      union
      select ${leads.buyerId} as id
        from ${leads}
        where ${leads.createdAt} >= ${engagementSince}
      union
      select ${lists.userId} as id
        from ${listItems}
        inner join ${lists} on ${lists.id} = ${listItems.listId}
        where ${listItems.createdAt} >= ${engagementSince}
    ) active_buyers
  `);
  const activeRow = result.rows[0] as { active: number | string } | undefined;

  return {
    registered: Number(registeredRow?.n ?? 0),
    active: Number(activeRow?.active ?? 0),
  };
}

export interface SellerCounts {
  /** Accounts with the `seller` role. */
  sellers: number;
  /** Sellers with ≥1 active listing (spec §10). */
  activeSellers: number;
}

export async function getSellerCounts(
  db: Db = defaultDb,
): Promise<SellerCounts> {
  const sellers = await countSellers(db);
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${listings.sellerId})::int` })
    .from(listings)
    .where(and(eq(listings.status, "active"), isNull(listings.deletedAt)));
  return { sellers, activeSellers: Number(row?.n ?? 0) };
}

export interface MetaConnectionStats {
  /** `meta_connections.status = 'active'` (spec §10). */
  connected: number;
  /** All sellers, for the "% of sellers connected" figure. */
  sellersTotal: number;
  /** `connected / sellersTotal * 100`, or `null` when there are no sellers. */
  pct: number | null;
  /** Active connections that have wired an ad account. */
  adAccountConnected: number;
  /** Active connections that have configured a pixel. */
  pixelConfigured: number;
  /**
   * Active connections that also sent an event in the last 7d (spec §10). A
   * connection that sends no events is effectively broken (§4.1.1) — surfaced
   * distinctly from mere `connected`.
   */
  healthy: number;
}

export async function getMetaConnectionStats(
  db: Db = defaultDb,
  now: Date = new Date(),
): Promise<MetaConnectionStats> {
  const healthySince = metaHealthySince(now);
  const [row] = await db
    .select({
      connected: sql<number>`count(*) filter (where ${metaConnections.status} = 'active')::int`,
      adAccountConnected: sql<number>`count(*) filter (where ${metaConnections.status} = 'active' and ${metaConnections.adAccountId} is not null)::int`,
      pixelConfigured: sql<number>`count(*) filter (where ${metaConnections.status} = 'active' and ${metaConnections.pixelId} is not null)::int`,
      healthy: sql<number>`count(*) filter (where ${metaConnections.status} = 'active' and ${metaConnections.lastEventAt} >= ${healthySince})::int`,
    })
    .from(metaConnections);

  const sellersTotal = await countSellers(db);
  const connected = Number(row?.connected ?? 0);
  return {
    connected,
    sellersTotal,
    pct: sellersTotal === 0 ? null : (connected / sellersTotal) * 100,
    adAccountConnected: Number(row?.adAccountConnected ?? 0),
    pixelConfigured: Number(row?.pixelConfigured ?? 0),
    healthy: Number(row?.healthy ?? 0),
  };
}

/** Non-deleted listing counts keyed by status, zero-filled (spec §4.1.1). */
export async function getListingsByStatus(
  db: Db = defaultDb,
): Promise<Record<ListingStatus, number>> {
  const rows = await db
    .select({
      status: listings.status,
      n: sql<number>`count(*)::int`,
    })
    .from(listings)
    .where(isNull(listings.deletedAt))
    .groupBy(listings.status);

  const counts = Object.fromEntries(
    listingStatus.enumValues.map((s) => [s, 0]),
  ) as Record<ListingStatus, number>;
  for (const row of rows) {
    counts[row.status] = Number(row.n);
  }
  return counts;
}

export interface SignupSplit {
  total: number;
  buyers: number;
  sellers: number;
}

/**
 * New signups in a period, split by whether the account currently holds the
 * `seller` role (spec §4.1.1). Authoritative (counts `users`, not the
 * best-effort event stream); the rollup's `signups` metric is the charted
 * series.
 */
export async function getSignupsInPeriod(
  db: Db,
  range: DateRange,
): Promise<SignupSplit> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sellers: sql<number>`count(*) filter (where ${userRoles.userId} is not null)::int`,
    })
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.role, "seller")),
    )
    .where(
      and(
        isNull(users.deletedAt),
        gte(users.createdAt, range.start),
        lt(users.createdAt, range.end),
      ),
    );
  const total = Number(row?.total ?? 0);
  const sellers = Number(row?.sellers ?? 0);
  return { total, buyers: total - sellers, sellers };
}

/** Leads created in a period (spec §4.1.1). */
export async function getLeadsInPeriod(
  db: Db,
  range: DateRange,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(gte(leads.createdAt, range.start), lt(leads.createdAt, range.end)),
    );
  return Number(row?.n ?? 0);
}

/**
 * Median leads-per-listing over a period (spec §4.1.1). Taken across listings
 * that received ≥1 lead in the window; `null` when no leads were submitted.
 */
export async function getLeadsPerListingMedian(
  db: Db,
  range: DateRange,
): Promise<number | null> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(gte(leads.createdAt, range.start), lt(leads.createdAt, range.end)),
    )
    .groupBy(leads.listingId);
  return median(rows.map((r) => Number(r.n)));
}

/** Period-scoped funnel: views → inquiry starts → submissions (spec §10). */
export async function getFunnel(db: Db, range: DateRange): Promise<Funnel> {
  const [row] = await db
    .select({
      views: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'listing_view')::int`,
      starts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'inquiry_started')::int`,
      submitted: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'inquiry_submitted')::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        gte(analyticsEvents.occurredAt, range.start),
        lt(analyticsEvents.occurredAt, range.end),
      ),
    );
  return computeFunnel(
    Number(row?.views ?? 0),
    Number(row?.starts ?? 0),
    Number(row?.submitted ?? 0),
  );
}

export interface Metric {
  current: number;
  previous: number;
  trend: Trend;
}

/**
 * Wrap any period-scoped count with its previous-period trend (spec §4.1.1 KPI
 * cards). Runs the two windows concurrently:
 *
 *   metricWithTrend(period, (range) => getLeadsInPeriod(db, range))
 */
export async function metricWithTrend(
  period: Period,
  count: (range: DateRange) => Promise<number>,
): Promise<Metric> {
  const [current, previous] = await Promise.all([
    count(period.current),
    count(period.previous),
  ]);
  return { current, previous, trend: computeTrend(current, previous) };
}
