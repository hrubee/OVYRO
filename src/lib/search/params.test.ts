import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LIMIT,
  listingSearchToQuery,
  parseListingSearch,
} from "./params";

describe("parseListingSearch", () => {
  test("empty query yields defaults", () => {
    const params = parseListingSearch({});
    expect(params.sort).toBe("newest");
    expect(params.limit).toBe(DEFAULT_LIMIT);
    expect(params.q).toBeUndefined();
    expect(params.priceMin).toBeUndefined();
  });

  test("reads filters from a plain object and a URLSearchParams alike", () => {
    const expected = { q: "nashik", landType: "agricultural", priceMax: 500000 };
    const fromObject = parseListingSearch({
      q: "nashik",
      landType: "agricultural",
      priceMax: "500000",
    });
    const fromSearch = parseListingSearch(
      new URLSearchParams("q=nashik&landType=agricultural&priceMax=500000"),
    );
    expect(fromObject).toMatchObject(expected);
    expect(fromSearch).toMatchObject(expected);
  });

  test("blank and whitespace text fields are treated as unset", () => {
    const params = parseListingSearch({ q: "   ", region: "" });
    expect(params.q).toBeUndefined();
    expect(params.region).toBeUndefined();
  });

  test("non-numeric numeric filters are dropped, not errored", () => {
    const params = parseListingSearch({ priceMin: "abc", areaMax: "-5" });
    expect(params.priceMin).toBeUndefined();
    expect(params.areaMax).toBeUndefined();
  });

  test("booleans parse tri-state tokens (false is not truthy)", () => {
    expect(parseListingSearch({ roadAccess: "true" }).roadAccess).toBe(true);
    expect(parseListingSearch({ roadAccess: "on" }).roadAccess).toBe(true);
    expect(parseListingSearch({ roadAccess: "false" }).roadAccess).toBe(false);
    expect(parseListingSearch({ roadAccess: "0" }).roadAccess).toBe(false);
    expect(parseListingSearch({ roadAccess: "maybe" }).roadAccess).toBeUndefined();
  });

  test("invalid enum/sort values fall back rather than throw", () => {
    expect(parseListingSearch({ sort: "banana" }).sort).toBe("newest");
    expect(parseListingSearch({ landType: "castle" }).landType).toBeUndefined();
    expect(parseListingSearch({ sort: "price_asc" }).sort).toBe("price_asc");
  });

  test("limit is bounded; out-of-range and garbage fall back to the default", () => {
    expect(parseListingSearch({ limit: "10" }).limit).toBe(10);
    expect(parseListingSearch({ limit: "999" }).limit).toBe(DEFAULT_LIMIT);
    expect(parseListingSearch({ limit: "abc" }).limit).toBe(DEFAULT_LIMIT);
  });

  test("cursor passes through untouched", () => {
    expect(parseListingSearch({ cursor: "abc123" }).cursor).toBe("abc123");
  });
});

describe("listingSearchToQuery", () => {
  test("omits defaults and undefined values", () => {
    const query = listingSearchToQuery({
      sort: "newest",
      limit: DEFAULT_LIMIT,
      q: undefined,
    });
    expect(query).toBe("");
  });

  test("serializes active filters and non-default sort", () => {
    const query = listingSearchToQuery({
      q: "plot",
      landType: "commercial",
      priceMin: 1000,
      roadAccess: true,
      sort: "price_asc",
    });
    const parsed = new URLSearchParams(query);
    expect(parsed.get("q")).toBe("plot");
    expect(parsed.get("landType")).toBe("commercial");
    expect(parsed.get("priceMin")).toBe("1000");
    expect(parsed.get("roadAccess")).toBe("true");
    expect(parsed.get("sort")).toBe("price_asc");
  });

  test("overrides replace an axis while preserving filters", () => {
    const query = listingSearchToQuery(
      { q: "farm", sort: "newest" },
      { cursor: "next-page", sort: "popularity" },
    );
    const parsed = new URLSearchParams(query);
    expect(parsed.get("q")).toBe("farm");
    expect(parsed.get("cursor")).toBe("next-page");
    expect(parsed.get("sort")).toBe("popularity");
  });
});
