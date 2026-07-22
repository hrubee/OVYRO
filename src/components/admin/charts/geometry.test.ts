import { describe, expect, test } from "bun:test";
import { buildBars, buildLine, niceCeil, plotArea, resolveBox, yTicks } from "./geometry";

describe("niceCeil", () => {
  test("rounds up to the next 1/2/5 × 10ⁿ", () => {
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(11)).toBe(20);
    expect(niceCeil(43)).toBe(50);
    expect(niceCeil(97)).toBe(100);
    expect(niceCeil(143)).toBe(200);
  });

  test("degenerate input yields a valid axis of at least 1", () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(NaN)).toBe(1);
  });
});

describe("yTicks", () => {
  test("evenly spaced 0..max inclusive", () => {
    expect(yTicks(100, 4)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("buildLine", () => {
  const box = { width: 100, height: 100, padTop: 0, padRight: 0, padBottom: 0, padLeft: 0 };

  test("is zero-based: value 0 sits on the baseline, max at the top", () => {
    const geo = buildLine([0, 10], { ...box, max: 10 });
    expect(geo.baselineY).toBe(100);
    expect(geo.points[0].y).toBe(100); // 0 → baseline
    expect(geo.points[1].y).toBe(0); // max → top
  });

  test("spreads points evenly across the plot width", () => {
    const geo = buildLine([1, 2, 3], { ...box, max: 3 });
    expect(geo.points[0].x).toBe(0);
    expect(geo.points[2].x).toBe(100);
    expect(geo.points[1].x).toBeCloseTo(50);
  });

  test("a single point is horizontally centred", () => {
    const geo = buildLine([5], { ...box, max: 10 });
    expect(geo.points).toHaveLength(1);
    expect(geo.points[0].x).toBe(50);
  });

  test("an all-zero series sits flat on the baseline, no NaN", () => {
    const geo = buildLine([0, 0, 0], box);
    expect(geo.line).not.toContain("NaN");
    expect(geo.points.every((p) => p.y === geo.baselineY)).toBe(true);
  });

  test("empty series yields empty attributes", () => {
    const geo = buildLine([], box);
    expect(geo.line).toBe("");
    expect(geo.area).toBe("");
  });

  test("area closes to the baseline at both ends", () => {
    const geo = buildLine([2, 8], { ...box, max: 10 });
    expect(geo.area.startsWith(`${geo.points[0].x},${geo.baselineY}`)).toBe(true);
    expect(geo.area.endsWith(`${geo.points[1].x},${geo.baselineY}`)).toBe(true);
  });

  test("defaults the axis max to niceCeil(max value)", () => {
    const geo = buildLine([3, 43], box);
    expect(geo.max).toBe(50);
  });
});

describe("buildBars", () => {
  const box = { width: 100, height: 100, padTop: 0, padRight: 0, padBottom: 0, padLeft: 0 };

  test("heights are proportional to value / max, zero-based", () => {
    const { bars } = buildBars([0, 5, 10], { ...box, max: 10, gap: 0 });
    expect(bars[0].height).toBe(0);
    expect(bars[1].height).toBe(50);
    expect(bars[2].height).toBe(100);
    expect(bars[2].y).toBe(0); // tall bar reaches the top
  });

  test("bars are slotted evenly and honour the gap fraction", () => {
    const { bars } = buildBars([1, 1], { ...box, max: 1, gap: 0.5 });
    expect(bars).toHaveLength(2);
    expect(bars[0].width).toBe(25); // slot 50 × (1 − 0.5)
    expect(bars[1].x).toBeGreaterThan(bars[0].x);
  });

  test("all-zero series produces zero-height bars, not NaN", () => {
    const { bars } = buildBars([0, 0], box);
    expect(bars.every((b) => b.height === 0)).toBe(true);
  });
});

describe("plotArea / resolveBox", () => {
  test("plot rectangle subtracts padding on every side", () => {
    const area = plotArea(resolveBox({ width: 100, height: 100, padTop: 10, padRight: 10, padBottom: 10, padLeft: 10 }));
    expect(area).toMatchObject({ x: 10, y: 10, width: 80, height: 80 });
  });
});
