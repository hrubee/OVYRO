/**
 * Pure SVG geometry for {@link ../sparkline}. Split out from the component so the
 * scaling maths — flat-series and single-point edge cases especially — can be
 * unit-tested without a DOM.
 *
 * Coordinates map the value series left→right across the width, with the max
 * value at the top and the min at the bottom (a normalized, not zero-based,
 * y-axis — a sparkline shows shape, not absolute magnitude).
 */
export interface SparklineGeometry {
  /** `points` attribute for the trend polyline. Empty when there is no data. */
  line: string;
  /** `points` for a filled area polygon (the line closed down to the baseline). */
  area: string;
  width: number;
  height: number;
}

export interface SparklineOptions {
  width?: number;
  height?: number;
  /** Inset (px) so the stroke is not clipped at the edges. */
  padding?: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildSparkline(
  values: number[],
  opts: SparklineOptions = {},
): SparklineGeometry {
  const width = opts.width ?? 120;
  const height = opts.height ?? 32;
  const padding = opts.padding ?? 2;

  const n = values.length;
  if (n === 0) {
    return { line: "", area: "", width, height };
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const x = (i: number): number =>
    n === 1 ? width / 2 : padding + (innerW * i) / (n - 1);
  // A flat series (span 0, includes all-zero) sits on a mid baseline rather
  // than dividing by zero or collapsing to the top edge.
  const y = (v: number): number =>
    span === 0 ? height / 2 : padding + innerH * (1 - (v - min) / span);

  const coords = values.map((v, i) => `${round(x(i))},${round(y(v))}`);
  const line = coords.join(" ");
  const baseY = round(height - padding);
  const area = `${round(x(0))},${baseY} ${line} ${round(x(n - 1))},${baseY}`;

  return { line, area, width, height };
}
