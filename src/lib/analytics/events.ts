/**
 * Event and metric vocabulary for the analytics module (spec §10).
 *
 * Two closed sets, wired together by {@link EVENT_TO_METRIC}:
 *
 *  - `ANALYTICS_EVENTS` — the raw funnel events written to `analytics_events`
 *    by {@link ../track}. A closed union so a typo can't silently mint a new
 *    event name that never shows up in a chart.
 *  - `METRICS` — the keys stored in `metrics_daily` by the nightly rollup and
 *    read back by the admin dashboards. Kept separate from event names because
 *    a metric is a *count over a period* ("listings_created"), not the event
 *    itself ("listing_created"), and some metrics (leads, active buyers) are
 *    derived from domain tables, not the event stream.
 */

export const ANALYTICS_EVENTS = [
  "signup",
  "listing_view",
  "listing_created",
  "save",
  "inquiry_started",
  "inquiry_submitted",
  "seller_onboarding_started",
  "seller_onboarding_submitted",
  "meta_connected",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const ANALYTICS_EVENT_SET: ReadonlySet<string> = new Set(ANALYTICS_EVENTS);

/** Type guard for untrusted input (e.g. a beacon body) before it is tracked. */
export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === "string" && ANALYTICS_EVENT_SET.has(value);
}

/**
 * Metric keys persisted in `metrics_daily.metric`. Values are the exact
 * strings stored in the column — pluralised, past-tense counts — so the rollup
 * writer and the dashboard reader can never drift.
 */
export const METRICS = {
  signups: "signups",
  listingViews: "listing_views",
  listingsCreated: "listings_created",
  saves: "saves",
  inquiriesStarted: "inquiries_started",
  inquiriesSubmitted: "inquiries_submitted",
  sellerOnboardingStarted: "seller_onboarding_started",
  sellerOnboardingSubmitted: "seller_onboarding_submitted",
  metaConnected: "meta_connected",
} as const;

export type MetricKey = (typeof METRICS)[keyof typeof METRICS];

/**
 * Each raw event folds into exactly one daily metric. `satisfies` keeps this
 * total over the event union, so adding an event without a metric breaks the
 * build here rather than dropping the event silently from every rollup.
 */
export const EVENT_TO_METRIC = {
  signup: METRICS.signups,
  listing_view: METRICS.listingViews,
  listing_created: METRICS.listingsCreated,
  save: METRICS.saves,
  inquiry_started: METRICS.inquiriesStarted,
  inquiry_submitted: METRICS.inquiriesSubmitted,
  seller_onboarding_started: METRICS.sellerOnboardingStarted,
  seller_onboarding_submitted: METRICS.sellerOnboardingSubmitted,
  meta_connected: METRICS.metaConnected,
} satisfies Record<AnalyticsEventName, MetricKey>;
