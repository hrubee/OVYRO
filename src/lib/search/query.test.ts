import { describe, expect, test } from "bun:test";
import type { ListingRow } from "@/lib/listings";
import { parseListingSearch } from "./params";
import {
  buildListingWhere,
  buildOrderBy,
  decodeCursor,
  encodeCursor,
} from "./query";

/** Minimal row carrying only the fields the cursor encoders read. */
function rowFixture(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    id: "01HZY000000000000000000000",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    price: "125000.00",
    area: "2.50",
    viewCount: 42,
    ...overrides,
  } as ListingRow;
}

describe("keyset cursor", () => {
  test("round-trips per sort and carries the row id", () => {
    const row = rowFixture();
    for (const sort of ["newest", "price_asc", "area_desc", "popularity"] as const) {
      const decoded = decodeCursor(encodeCursor(sort, row), sort);
      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe(row.id);
    }
  });

  test("encodes the sort-specific value", () => {
    const row = rowFixture();
    expect(decodeCursor(encodeCursor("price_asc", row), "price_asc")?.value).toBe(
      "125000.00",
    );
    expect(decodeCursor(encodeCursor("newest", row), "newest")?.value).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(decodeCursor(encodeCursor("popularity", row), "popularity")?.value).toBe(
      "42",
    );
  });

  test("rejects a cursor minted for a different sort", () => {
    const cursor = encodeCursor("price_asc", rowFixture());
    expect(decodeCursor(cursor, "newest")).toBeNull();
  });

  test("returns null on malformed input", () => {
    expect(decodeCursor("not-base64-json", "newest")).toBeNull();
    expect(decodeCursor("", "newest")).toBeNull();
  });
});

describe("query construction", () => {
  test("buildOrderBy returns a primary key plus the id tiebreaker", () => {
    expect(buildOrderBy("newest")).toHaveLength(2);
    expect(buildOrderBy("popularity")).toHaveLength(2);
  });

  test("buildListingWhere assembles without a database for varied filters", () => {
    const cases = [
      {},
      { q: "riverside plot" },
      { region: "Karnataka", landType: "agricultural" },
      { priceMin: "100000", priceMax: "500000" },
      { areaUnit: "acre", areaMin: "1", areaMax: "5" },
      { roadAccess: "true", water: "false", electricity: "true" },
    ];
    for (const raw of cases) {
      expect(buildListingWhere(parseListingSearch(raw))).toBeDefined();
    }
  });

  test("a valid cursor is folded into the WHERE clause", () => {
    const cursor = encodeCursor("newest", rowFixture());
    const where = buildListingWhere(parseListingSearch({ cursor, sort: "newest" }));
    expect(where).toBeDefined();
  });
});
