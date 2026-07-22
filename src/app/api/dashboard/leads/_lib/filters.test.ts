import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { parseLeadFilters } from "./filters";

const parse = (qs: string) => parseLeadFilters(new URLSearchParams(qs));

describe("parseLeadFilters — empty / absent", () => {
  test("no params → no filters", () => {
    expect(parse("")).toEqual({});
  });

  test("blank values are dropped (unset controls never narrow)", () => {
    expect(parse("status=&listingId=&from=&to=")).toEqual({});
  });

  test("unknown params are ignored, not rejected", () => {
    expect(parse("page=2&sort=hot")).toEqual({});
  });
});

describe("parseLeadFilters — listing + status", () => {
  test("passes through a listing id", () => {
    expect(parse("listingId=abc123")).toEqual({ listingId: "abc123" });
  });

  test("accepts every valid lead status", () => {
    for (const status of ["new", "contacted", "negotiating", "won", "lost"] as const) {
      expect(parse(`status=${status}`)).toEqual({ status });
    }
  });

  test("rejects an unknown status", () => {
    expect(() => parse("status=archived")).toThrow(ZodError);
  });
});

describe("parseLeadFilters — date range", () => {
  test("coerces from/to to Date", () => {
    const filters = parse("from=2026-07-01&to=2026-07-31");
    expect(filters.from).toBeInstanceOf(Date);
    expect(filters.to).toBeInstanceOf(Date);
    expect(filters.from?.getUTCFullYear()).toBe(2026);
  });

  test("accepts either bound alone", () => {
    expect(parse("from=2026-07-01").to).toBeUndefined();
    expect(parse("to=2026-07-31").from).toBeUndefined();
  });

  test("accepts full ISO timestamps", () => {
    const filters = parse(`from=${encodeURIComponent("2026-07-01T09:30:00.000Z")}`);
    expect(filters.from?.toISOString()).toBe("2026-07-01T09:30:00.000Z");
  });

  test("rejects an unparseable date", () => {
    expect(() => parse("from=not-a-date")).toThrow(ZodError);
  });

  test("rejects an inverted range (from after to)", () => {
    expect(() => parse("from=2026-07-31&to=2026-07-01")).toThrow(ZodError);
  });

  test("allows from === to (single-day window)", () => {
    expect(() => parse("from=2026-07-15&to=2026-07-15")).not.toThrow();
  });
});
