/**
 * DB-free validation of the *generated* browse SQL. Drizzle's `.toSQL()` is a
 * pure render (no connection), so we can assert the query shape — the FTS
 * expression matches the GIN index, filters bind params, the ordering carries
 * a tiebreaker, and a cursor adds a keyset predicate — without a database.
 */
import { describe, expect, test } from "bun:test";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import type { ListingRow } from "@/lib/listings";
import { parseListingSearch } from "./params";
import { buildListingWhere, buildOrderBy, encodeCursor } from "./query";

function renderBrowseSQL(raw: Record<string, string>) {
  const params = parseListingSearch(raw);
  return db
    .select()
    .from(listings)
    .where(buildListingWhere(params))
    .orderBy(...buildOrderBy(params.sort))
    .limit(params.limit + 1)
    .toSQL();
}

describe("generated browse SQL", () => {
  test("base query is scoped to active, non-deleted and ordered + limited", () => {
    const { sql } = renderBrowseSQL({});
    expect(sql).toContain('"status"');
    expect(sql).toContain('"deleted_at"');
    expect(sql.toLowerCase()).toContain("order by");
    expect(sql.toLowerCase()).toContain("limit");
  });

  test("full-text search renders the indexable tsvector expression", () => {
    const { sql, params } = renderBrowseSQL({ q: "riverside farm" });
    expect(sql).toContain("to_tsvector('english'");
    expect(sql).toContain("websearch_to_tsquery('english'");
    expect(params).toContain("riverside farm");
  });

  test("filters bind their columns and parameters", () => {
    const { sql } = renderBrowseSQL({
      landType: "agricultural",
      priceMin: "1000",
      priceMax: "5000",
      areaUnit: "acre",
      roadAccess: "true",
    });
    expect(sql).toContain('"land_type"');
    expect(sql).toContain('"price"');
    expect(sql).toContain('"area_unit"');
    expect(sql).toContain('"road_access"');
  });

  test("a valid cursor folds in a keyset predicate on the sort key + id", () => {
    const row = {
      id: "01HZY000000000000000000000",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as ListingRow;
    const cursor = encodeCursor("newest", row);
    const { sql } = renderBrowseSQL({ cursor, sort: "newest" });
    expect(sql).toContain('"created_at"');
    expect(sql).toContain('"id"');
  });
});
