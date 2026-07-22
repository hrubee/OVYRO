/**
 * Presentation formatters shared across the admin overview + analytics surfaces
 * (spec §4.1.1, §4.1.5). Pure and locale-fixed so a card, a chart axis, and a
 * tooltip all render the same number the same way — and so the rounding is
 * unit-testable without a DOM.
 */

const COUNT = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Grouped integer, e.g. `1,204`. Non-finite input renders as an em dash. */
export function fmtCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return COUNT.format(n);
}

/** Compact integer for dense axes/labels, e.g. `1.2K`. */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return COMPACT.format(n);
}

/**
 * A ratio in `[0, 1]` as a percent, e.g. `0.042 → "4.2%"`. `null` (an undefined
 * ratio — a zero denominator) renders as an em dash, never `NaN%` or `0%`; the
 * two are semantically different (spec §10 keeps undefined ratios `null`).
 */
export function fmtRatio(
  ratio: number | null | undefined,
  fractionDigits = 1,
): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/**
 * A share of a whole as a percent, e.g. `fmtShare(3, 12) → "25%"`. `null`
 * denominator or zero total → em dash.
 */
export function fmtShare(part: number, total: number | null): string {
  if (total == null || total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

/**
 * A trend's percent-change chip (spec §4.1.1 "trend vs previous period"). The
 * value is an already-computed percentage (`Trend.pct`); `null` means the prior
 * period was zero — growth from nothing, labelled "New" rather than "+∞%".
 */
export function fmtTrendPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "New";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
