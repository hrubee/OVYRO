import {
  bigint,
  date,
  index,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { timestamps } from "./columns";

/**
 * Pre-aggregated daily rollups (spec §10). A nightly worker folds the
 * high-volume `analytics_events` stream down into one row per
 * `(date, metric, dimension)` so the admin overview and time-series charts
 * (§4.1.1, §4.1.5) render from a tiny, indexed table instead of scanning the
 * event log on every page load. The overview cards layer a small "today so
 * far" live delta on top of these rollups.
 *
 * Shape follows the spec verbatim: `(date, metric, dimension, value)`.
 *
 * `dimension` is `NOT NULL DEFAULT ''` rather than nullable so the composite
 * primary key is well-defined and the rollup can upsert idempotently
 * (`ON CONFLICT (date, metric, dimension) DO UPDATE`) — a nullable dimension
 * would make every re-run insert a duplicate, since NULLs compare distinct.
 * Un-dimensioned metrics use the empty string; a dimensioned metric (e.g.
 * `signups` broken out by role) stores one row per dimension value and its
 * period total is the SUM across those rows — never a separate `''` total,
 * which would double-count.
 */
export const metricsDaily = pgTable(
  "metrics_daily",
  {
    /** UTC calendar day, `YYYY-MM-DD`. */
    date: date("date", { mode: "string" }).notNull(),
    /** Metric key (see `METRICS` in `src/lib/analytics`). */
    metric: text("metric").notNull(),
    /** Breakdown key ('' when the metric has no dimension). */
    dimension: text("dimension").notNull().default(""),
    /** Count for the day (bigint so cumulative chart queries never overflow). */
    value: bigint("value", { mode: "number" }).notNull().default(0),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.date, table.metric, table.dimension],
    }),
    // Time-series charts read a single metric across a date range.
    index("metrics_daily_metric_date_idx").on(table.metric, table.date),
  ],
);
