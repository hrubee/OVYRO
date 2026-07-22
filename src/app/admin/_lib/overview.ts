/**
 * Data loader for the `/admin` overview (spec §4.1.1). This module is a pure
 * *assembler*: every definitional figure comes from the analytics-core metric
 * helpers (`@/lib/analytics`), so the overview cannot drift from the spec §10
 * definitions or from the analytics charts, and the numbers reconcile with the
 * raw tables by construction (spec §14 acceptance).
 *
 * The one figure analytics-core does not yet define is the lead → seller
 * response rate (spec §4.1.1, gated on "lead status tracking is live"). Lead
 * status *is* live, so it is computed here from the `leads` table and kept as a
 * pure helper so the maths is unit-testable.
 */
import { and, gte, lt, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import type { Db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import {
  computeTrend,
  getActiveBuyers,
  getFunnel,
  getLeadsInPeriod,
  getLeadsPerListingMedian,
  getListingsByStatus,
  getMetaConnectionStats,
  getRegisteredUsers,
  getSellerCounts,
  getSignupsInPeriod,
  metricWithTrend,
  PERIOD_DAYS,
  resolvePeriod,
  type ActiveBuyers,
  type DateRange,
  type Funnel,
  type ListingStatus,
  type MetaConnectionStats,
  type Metric,
  type Period,
  type PeriodDays,
  type RegisteredUsers,
  type SellerCounts,
  type SignupSplit,
  type Trend,
} from "@/lib/analytics";

/**
 * Coerce a `?period=` search param to a valid 7/30/90 selector, falling back to
 * 30 for anything missing or out of range (spec §4.1.1).
 */
export function parsePeriodDays(
  raw: string | undefined,
  fallback: PeriodDays = 30,
): PeriodDays {
  const n = Number(raw);
  return (PERIOD_DAYS as readonly number[]).includes(n)
    ? (n as PeriodDays)
    : fallback;
}

export interface LeadResponse {
  /** Leads submitted in the period. */
  total: number;
  /** Of those, how many the seller has engaged (viewed or moved off `new`). */
  responded: number;
  /** `responded / total`, or `null` when there were no leads (spec §10 style). */
  rate: number | null;
}

/**
 * Pure response-rate maths. `null` when there were no leads — an undefined
 * ratio, distinct from 0% (the seller ignored every lead).
 */
export function computeResponseRate(
  total: number,
  responded: number,
): number | null {
  return total === 0 ? null : responded / total;
}

/**
 * Lead → seller-response rate over a period (spec §4.1.1). A lead counts as
 * "responded to" once the seller has engaged it: either first-viewed it, or
 * advanced its status off the initial `new`. Both live on the `leads` row.
 */
export async function getLeadResponse(
  db: Db,
  range: DateRange,
): Promise<LeadResponse> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      responded: sql<number>`count(*) filter (where ${leads.status} <> 'new' or ${leads.sellerFirstViewedAt} is not null)::int`,
    })
    .from(leads)
    .where(
      and(gte(leads.createdAt, range.start), lt(leads.createdAt, range.end)),
    );
  const total = Number(row?.total ?? 0);
  const responded = Number(row?.responded ?? 0);
  return { total, responded, rate: computeResponseRate(total, responded) };
}

export interface AdminOverview {
  period: Period;
  /** Registered accounts + buyers-only/sellers split (spec §4.1.1). */
  users: RegisteredUsers;
  /** Registered total + "active buyers" (spec §10 definition). */
  activeBuyers: ActiveBuyers;
  /** Sellers + active sellers (≥1 active listing). */
  sellers: SellerCounts;
  /** New signups this period vs the previous equal-length period. */
  signups: { current: SignupSplit; previous: SignupSplit; trend: Trend };
  /** Non-deleted listing counts by status, zero-filled. */
  listings: Record<ListingStatus, number>;
  /** Meta connection health (connected / ad-account / pixel / healthy). */
  meta: MetaConnectionStats;
  leads: {
    /** Leads in period with a trend vs the previous period. */
    metric: Metric;
    /** Median leads-per-listing across listings that got ≥1 lead. */
    median: number | null;
    /** Lead → seller response rate. */
    response: LeadResponse;
  };
  funnel: {
    current: Funnel;
    /** Trend of inquiries submitted vs the previous period. */
    trend: Trend;
  };
}

/**
 * Load the whole overview for a 7/30/90-day period. Every figure is fetched
 * concurrently; the period-scoped ones read the trailing window ending at `now`
 * so today's partial day is included (the spec §10 "today so far" delta falls
 * out for free because the helpers read the raw tables, not a nightly rollup).
 */
export async function loadAdminOverview(
  days: PeriodDays,
  now: Date = new Date(),
  db: Db = defaultDb,
): Promise<AdminOverview> {
  const period = resolvePeriod(days, now);

  const [
    users,
    activeBuyers,
    sellers,
    listings,
    meta,
    signupsCurrent,
    signupsPrevious,
    leadsMetric,
    leadsMedian,
    leadResponse,
    funnelCurrent,
    funnelPrevious,
  ] = await Promise.all([
    getRegisteredUsers(db),
    getActiveBuyers(db, now),
    getSellerCounts(db),
    getListingsByStatus(db),
    getMetaConnectionStats(db, now),
    getSignupsInPeriod(db, period.current),
    getSignupsInPeriod(db, period.previous),
    metricWithTrend(period, (range) => getLeadsInPeriod(db, range)),
    getLeadsPerListingMedian(db, period.current),
    getLeadResponse(db, period.current),
    getFunnel(db, period.current),
    getFunnel(db, period.previous),
  ]);

  return {
    period,
    users,
    activeBuyers,
    sellers,
    signups: {
      current: signupsCurrent,
      previous: signupsPrevious,
      trend: computeTrend(signupsCurrent.total, signupsPrevious.total),
    },
    listings,
    meta,
    leads: { metric: leadsMetric, median: leadsMedian, response: leadResponse },
    funnel: {
      current: funnelCurrent,
      trend: computeTrend(
        funnelCurrent.inquiriesSubmitted,
        funnelPrevious.inquiriesSubmitted,
      ),
    },
  };
}
