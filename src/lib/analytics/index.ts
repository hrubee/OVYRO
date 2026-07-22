/**
 * Analytics module (spec §10) — first-party product analytics for the admin
 * dashboards, with no third-party dependency.
 *
 *  - {@link ./events}  — the closed event + metric vocabulary.
 *  - {@link ./track}   — server-side write path (`track` + named helpers, bot filter).
 *  - {@link ./rollup}  — fold `analytics_events` → `metrics_daily` (pure + worker runner).
 *  - {@link ./metrics} — spec §10 metric definitions read back for the dashboards.
 *
 * Import from `@/lib/analytics`; the sub-modules are an implementation detail.
 */
export * from "./events";
export * from "./track";
export * from "./rollup";
export * from "./metrics";
