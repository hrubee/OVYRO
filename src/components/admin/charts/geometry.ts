/**
 * Pure SVG geometry for the admin analytics charts (spec §4.1.5). Kept separate
 * from the components so the scaling maths — the zero-based y-axis, nice tick
 * rounding, bar widths, and the flat/empty edge cases — can be unit-tested
 * without a DOM, and so the line chart and bar chart never disagree on how a
 * value maps to a coordinate.
 *
 * Unlike the seller-stats sparkline (which normalises min→max to show *shape*),
 * these charts use a **zero-based** y-axis so bar heights and line altitudes are
 * comparable across panels and honestly show magnitude.
 */

export interface Point {
  x: number;
  y: number;
}

export interface ChartBox {
  width: number;
  height: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
}

/** Inner plotting rectangle after padding is removed. */
export function plotArea(box: ChartBox): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: box.padLeft,
    y: box.padTop,
    width: Math.max(0, box.width - box.padLeft - box.padRight),
    height: Math.max(0, box.height - box.padTop - box.padBottom),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Round a raw maximum up to a "nice" axis bound — the next 1/2/5 × 10ⁿ — so
 * gridline labels are readable (10, 20, 50, 100…) instead of 97 or 143. Always
 * returns ≥ 1 so an all-zero series still yields a valid, non-degenerate axis.
 */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const fraction = value / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

/**
 * Evenly spaced tick values from 0 to `max` inclusive, `count` intervals. Used
 * for horizontal gridlines and their labels.
 */
export function yTicks(max: number, count = 4): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push(round((max * i) / count));
  }
  return ticks;
}

export interface LineOptions extends Partial<ChartBox> {
  /** Force the axis maximum; defaults to `niceCeil(max(values))`. */
  max?: number;
}

const DEFAULT_BOX: ChartBox = {
  width: 640,
  height: 200,
  padTop: 8,
  padRight: 8,
  padBottom: 20,
  padLeft: 36,
};

export function resolveBox(opts: Partial<ChartBox> = {}): ChartBox {
  return { ...DEFAULT_BOX, ...opts };
}

export interface LineGeometry {
  points: Point[];
  /** `points` attribute for a `<polyline>`. */
  line: string;
  /** `points` for a filled `<polygon>` closed to the baseline. */
  area: string;
  /** The axis maximum actually used (post nice-rounding). */
  max: number;
  box: ChartBox;
  /** Baseline (value 0) y-coordinate. */
  baselineY: number;
}

/**
 * Map a value series to a zero-based line + area across the plot rectangle.
 * A single point is centred; an all-zero or empty series sits flat on the
 * baseline rather than dividing by zero.
 */
export function buildLine(values: number[], opts: LineOptions = {}): LineGeometry {
  const box = resolveBox(opts);
  const area = plotArea(box);
  const n = values.length;
  const rawMax = n === 0 ? 0 : Math.max(...values, 0);
  const max = opts.max ?? niceCeil(rawMax);
  const baselineY = round(area.y + area.height);

  const xAt = (i: number): number =>
    n <= 1 ? area.x + area.width / 2 : area.x + (area.width * i) / (n - 1);
  const yAt = (v: number): number =>
    max === 0 ? baselineY : round(area.y + area.height * (1 - v / max));

  const points = values.map((v, i) => ({ x: round(xAt(i)), y: yAt(v) }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaAttr =
    points.length === 0
      ? ""
      : `${points[0].x},${baselineY} ${line} ${points[n - 1].x},${baselineY}`;

  return { points, line, area: areaAttr, max, box, baselineY };
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

export interface BarsOptions extends Partial<ChartBox> {
  max?: number;
  /** Gap between bars as a fraction of the slot width (0–1). */
  gap?: number;
}

export interface BarsGeometry {
  bars: Bar[];
  max: number;
  box: ChartBox;
  baselineY: number;
}

/**
 * Vertical bars for a value series, zero-based and evenly slotted. Heights are
 * proportional to `value / max`; a zero value yields a zero-height bar (not a
 * negative or NaN one).
 */
export function buildBars(values: number[], opts: BarsOptions = {}): BarsGeometry {
  const box = resolveBox(opts);
  const area = plotArea(box);
  const gap = opts.gap ?? 0.3;
  const n = values.length;
  const rawMax = n === 0 ? 0 : Math.max(...values, 0);
  const max = opts.max ?? niceCeil(rawMax);
  const baselineY = round(area.y + area.height);

  const slot = n === 0 ? 0 : area.width / n;
  const barWidth = round(slot * (1 - gap));

  const bars: Bar[] = values.map((value, i) => {
    const h = max === 0 ? 0 : round((value / max) * area.height);
    const x = round(area.x + slot * i + (slot - barWidth) / 2);
    return { x, y: round(baselineY - h), width: barWidth, height: h, value };
  });

  return { bars, max, box, baselineY };
}
