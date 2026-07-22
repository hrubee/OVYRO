import { describe, expect, test } from "bun:test";
import { buildSparkline } from "./sparkline-path";

/** Parse a `points` string into [x, y] number pairs. */
function parse(points: string): [number, number][] {
  if (points === "") return [];
  return points
    .trim()
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [x, y] as [number, number];
    });
}

describe("buildSparkline", () => {
  test("empty series yields no line or area", () => {
    const geo = buildSparkline([], { width: 100, height: 40 });
    expect(geo.line).toBe("");
    expect(geo.area).toBe("");
    expect(geo).toMatchObject({ width: 100, height: 40 });
  });

  test("spreads points evenly left → right across the padded width", () => {
    const geo = buildSparkline([0, 5, 10], { width: 100, height: 40, padding: 2 });
    const pts = parse(geo.line);
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBe(2); // first point at left padding
    expect(pts[2][0]).toBe(98); // last point at width - padding
    expect(pts[1][0]).toBeCloseTo(50); // middle centered
  });

  test("max value sits at the top, min at the bottom", () => {
    const geo = buildSparkline([1, 9], { width: 100, height: 40, padding: 2 });
    const [, [, yMin]] = parse(geo.line); // second point is the max value (9)
    const [[, yMax]] = parse(geo.line); // first point is the min value (1)
    expect(yMin).toBeLessThan(yMax); // higher value → smaller y (nearer top)
    expect(yMin).toBe(2); // top padding
    expect(yMax).toBe(38); // height - padding
  });

  test("a flat (all-equal) series draws on the mid baseline, not NaN", () => {
    const geo = buildSparkline([3, 3, 3], { width: 100, height: 40 });
    const ys = parse(geo.line).map(([, y]) => y);
    expect(ys).toEqual([20, 20, 20]); // height / 2
    expect(geo.line).not.toContain("NaN");
  });

  test("an all-zero series is treated as flat, not empty", () => {
    const geo = buildSparkline([0, 0, 0, 0], { width: 100, height: 40 });
    const ys = parse(geo.line).map(([, y]) => y);
    expect(ys.every((y) => y === 20)).toBe(true);
  });

  test("a single point is centered horizontally", () => {
    const geo = buildSparkline([7], { width: 100, height: 40 });
    const pts = parse(geo.line);
    expect(pts).toHaveLength(1);
    expect(pts[0][0]).toBe(50); // width / 2
  });

  test("area closes the line down to the baseline at both ends", () => {
    const geo = buildSparkline([1, 9], { width: 100, height: 40, padding: 2 });
    const area = parse(geo.area);
    const baseY = 38; // height - padding
    expect(area[0]).toEqual([2, baseY]); // opens at first x on the baseline
    expect(area.at(-1)).toEqual([98, baseY]); // closes at last x on the baseline
    expect(area).toHaveLength(4); // baseline-start, 2 points, baseline-end
  });
});
