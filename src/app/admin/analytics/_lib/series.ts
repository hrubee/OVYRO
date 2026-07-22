/**
 * Pure date/series shaping for the analytics time-series charts (spec §4.1.5).
 *
 * The rollup stores one row per `(date, metric, dimension)` and only for days
 * that actually saw an event — so a naïve read has *gaps* on quiet days. A chart
 * needs a dense, gap-free array aligned to a continuous date axis. These helpers
 * build that axis and fill the gaps with zero. Everything is pure and takes an
 * explicit end date (never `Date.now()`), so it is deterministic and testable.
 *
 * All dates are UTC calendar days (`YYYY-MM-DD`) to match `metrics_daily.date`,
 * which the nightly rollup writes in UTC.
 */

const DAY_MS = 86_400_000;

/** Format a `Date` as its UTC calendar day `YYYY-MM-DD`. */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a `YYYY-MM-DD` day to the `Date` at its UTC midnight. Throws if malformed. */
export function parseYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`parseYmd: expected YYYY-MM-DD, got "${ymd}"`);
  const [, y, mo, d] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

/**
 * The continuous list of UTC day keys ending at `endYmd` (inclusive), `days`
 * long, oldest → newest. `enumerateDays("2026-07-22", 3)` →
 * `["2026-07-20", "2026-07-21", "2026-07-22"]`.
 */
export function enumerateDays(endYmd: string, days: number): string[] {
  const end = parseYmd(endYmd).getTime();
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(toYmd(new Date(end - i * DAY_MS)));
  }
  return out;
}

/** Half-open `[start, end)` timestamps covering the whole `dayKeys` span. */
export function spanBounds(dayKeys: string[]): { start: Date; end: Date } {
  if (dayKeys.length === 0) {
    throw new Error("spanBounds: empty dayKeys");
  }
  const start = parseYmd(dayKeys[0]);
  const end = new Date(parseYmd(dayKeys[dayKeys.length - 1]).getTime() + DAY_MS);
  return { start, end };
}

/** A `(date, value)` row as returned by a grouped daily aggregate. */
export interface DailyRow {
  date: string;
  value: number;
}

/**
 * Project sparse `(date, value)` rows onto a dense array aligned to `dayKeys`,
 * zero-filling missing days. Rows outside the axis are ignored; duplicate dates
 * are summed (defensive — a well-formed rollup has one row per day).
 */
export function alignDailySeries(rows: DailyRow[], dayKeys: string[]): number[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + Number(row.value));
  }
  return dayKeys.map((d) => byDate.get(d) ?? 0);
}

/** Running total of a series (for cumulative adoption charts). `[1,0,2] → [1,1,3]`. */
export function cumulative(values: number[], base = 0): number[] {
  let acc = base;
  return values.map((v) => (acc += v));
}

/** Sum of a series — the chart's period total headline. */
export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
