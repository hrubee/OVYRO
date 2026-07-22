import { describe, expect, test } from "bun:test";
import {
  alignDailySeries,
  cumulative,
  enumerateDays,
  parseYmd,
  spanBounds,
  sum,
  toYmd,
} from "./series";

describe("toYmd / parseYmd", () => {
  test("round-trips a UTC day", () => {
    expect(toYmd(parseYmd("2026-07-22"))).toBe("2026-07-22");
  });

  test("parseYmd anchors at UTC midnight", () => {
    expect(parseYmd("2026-07-22").toISOString()).toBe("2026-07-22T00:00:00.000Z");
  });

  test("parseYmd rejects malformed input", () => {
    expect(() => parseYmd("2026/07/22")).toThrow();
  });
});

describe("enumerateDays", () => {
  test("returns `days` keys, oldest → newest, ending at endYmd", () => {
    expect(enumerateDays("2026-07-22", 3)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
    ]);
  });

  test("crosses a month boundary correctly", () => {
    expect(enumerateDays("2026-03-01", 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });

  test("length matches the requested window", () => {
    expect(enumerateDays("2026-07-22", 90)).toHaveLength(90);
  });
});

describe("spanBounds", () => {
  test("is half-open and covers the whole axis", () => {
    const { start, end } = spanBounds(["2026-07-20", "2026-07-21", "2026-07-22"]);
    expect(start.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    // end is start-of-day AFTER the last key (exclusive upper bound).
    expect(end.toISOString()).toBe("2026-07-23T00:00:00.000Z");
  });
});

describe("alignDailySeries", () => {
  const days = ["2026-07-20", "2026-07-21", "2026-07-22"];

  test("zero-fills gaps and orders by the axis", () => {
    const rows = [
      { date: "2026-07-22", value: 5 },
      { date: "2026-07-20", value: 2 },
    ];
    expect(alignDailySeries(rows, days)).toEqual([2, 0, 5]);
  });

  test("ignores rows outside the axis", () => {
    const rows = [{ date: "2026-01-01", value: 99 }];
    expect(alignDailySeries(rows, days)).toEqual([0, 0, 0]);
  });

  test("sums duplicate dates defensively", () => {
    const rows = [
      { date: "2026-07-21", value: 3 },
      { date: "2026-07-21", value: 4 },
    ];
    expect(alignDailySeries(rows, days)).toEqual([0, 7, 0]);
  });
});

describe("cumulative", () => {
  test("running total, optionally offset by a baseline", () => {
    expect(cumulative([1, 0, 2])).toEqual([1, 1, 3]);
    expect(cumulative([1, 2], 10)).toEqual([11, 13]);
  });
});

describe("sum", () => {
  test("adds a series", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
  });
});
