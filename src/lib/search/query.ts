/**
 * Public browse WHERE / ORDER BY / cursor construction (spec §4.2.1, §6, §7).
 *
 * Pure query *building* — no database handle. `service.ts` executes what these
 * functions assemble. Keeping the SQL shape here (and DB-free) makes the base
 * public predicate, the full-text match, and the keyset cursor unit-testable
 * and impossible to accidentally bypass.
 *
 * Public visibility invariant: only `status = 'active'` and non-soft-deleted
 * rows are ever selectable here (mirrors `isPubliclyVisible` in listings-core).
 */
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { listings } from "@/lib/db/schema";
import type { ListingRow } from "@/lib/listings";
import type { ListingSearchParams, ListingSort } from "./params";

/**
 * Per-sort keyset config. `column` is the primary ordering key; `id` (a ULID,
 * lexicographically chronological) is always the tiebreaker so the ordering is
 * total and the cursor unambiguous. `encode` reads the cursor value off a row;
 * `decode` turns it back into a value comparable against `column`.
 */
interface SortConfig {
  column: PgColumn;
  direction: "asc" | "desc";
  encode: (row: ListingRow) => string;
  decode: (value: string) => Date | string | number;
}

const SORTS: Record<ListingSort, SortConfig> = {
  newest: {
    column: listings.createdAt,
    direction: "desc",
    encode: (row) => row.createdAt.toISOString(),
    decode: (value) => new Date(value),
  },
  price_asc: {
    column: listings.price,
    direction: "asc",
    // numeric columns arrive as strings; keep the exact string for comparison.
    encode: (row) => row.price,
    decode: (value) => value,
  },
  price_desc: {
    column: listings.price,
    direction: "desc",
    encode: (row) => row.price,
    decode: (value) => value,
  },
  area_asc: {
    column: listings.area,
    direction: "asc",
    encode: (row) => row.area,
    decode: (value) => value,
  },
  area_desc: {
    column: listings.area,
    direction: "desc",
    encode: (row) => row.area,
    decode: (value) => value,
  },
  popularity: {
    column: listings.viewCount,
    direction: "desc",
    encode: (row) => String(row.viewCount),
    decode: (value) => Number(value),
  },
};

interface DecodedCursor {
  sort: ListingSort;
  value: string;
  id: string;
}

/**
 * Base predicate every public query carries: active + not soft-deleted. Nothing
 * in draft/pending/paused/sold/rejected/expired can leak onto a public surface.
 */
export function publicListingScope(): SQL {
  return and(eq(listings.status, "active"), isNull(listings.deletedAt))!;
}

/**
 * Full-text match over title + description + address. The `to_tsvector`
 * expression must match `listings_fts_idx` verbatim for the GIN index to be
 * used. `websearch_to_tsquery` tolerates any user input without throwing.
 */
function fullTextMatch(q: string): SQL {
  return sql`to_tsvector('english', coalesce(${listings.title}, '') || ' ' || coalesce(${listings.description}, '') || ' ' || coalesce(${listings.addressText}, '')) @@ websearch_to_tsquery('english', ${q})`;
}

/** Encode a keyset cursor from the last row of a page. */
export function encodeCursor(sort: ListingSort, row: ListingRow): string {
  const payload: DecodedCursor = {
    sort,
    value: SORTS[sort].encode(row),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decode a cursor, returning `null` for anything malformed or for a cursor that
 * belongs to a different sort than the current request (defends against a user
 * changing `sort` while carrying a stale `cursor`).
 */
export function decodeCursor(raw: string, sort: ListingSort): DecodedCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<DecodedCursor>;
    if (
      parsed.sort !== sort ||
      typeof parsed.value !== "string" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }
    return { sort, value: parsed.value, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * Keyset "everything strictly after this cursor" predicate. For a DESC sort the
 * next page is rows whose key is `< value` (ties broken by `id < cursorId`);
 * ASC flips both comparisons. This is the standard row-value keyset unfolded
 * into `col OP v OR (col = v AND id OP cursorId)`.
 */
function cursorPredicate(sort: ListingSort, cursor: DecodedCursor): SQL {
  const { column, direction, decode } = SORTS[sort];
  const value = decode(cursor.value);
  const cmp = direction === "asc" ? gt : lt;
  // col OP v  OR  (col = v AND id OP cursorId) — id breaks ties in sort order.
  return or(cmp(column, value), and(eq(column, value), cmp(listings.id, cursor.id)))!;
}

/**
 * Full WHERE for a browse query: base scope + every active filter + optional
 * cursor. Filters are independent and composable (e.g. `areaUnit=acre` plus an
 * `areaMin/areaMax` range gives "acre listings between N and M acres").
 */
export function buildListingWhere(params: ListingSearchParams): SQL {
  const clauses: SQL[] = [publicListingScope()];

  if (params.q) clauses.push(fullTextMatch(params.q));
  // Region select: exact, case-insensitive (ilike with no wildcards).
  if (params.region) clauses.push(ilike(listings.region, params.region));
  if (params.landType) clauses.push(eq(listings.landType, params.landType));
  if (params.areaUnit) clauses.push(eq(listings.areaUnit, params.areaUnit));
  if (params.priceMin !== undefined)
    clauses.push(gte(listings.price, String(params.priceMin)));
  if (params.priceMax !== undefined)
    clauses.push(lte(listings.price, String(params.priceMax)));
  if (params.areaMin !== undefined)
    clauses.push(gte(listings.area, String(params.areaMin)));
  if (params.areaMax !== undefined)
    clauses.push(lte(listings.area, String(params.areaMax)));
  if (params.roadAccess !== undefined)
    clauses.push(eq(listings.roadAccess, params.roadAccess));
  if (params.water !== undefined) clauses.push(eq(listings.water, params.water));
  if (params.electricity !== undefined)
    clauses.push(eq(listings.electricity, params.electricity));

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor, params.sort);
    if (decoded) clauses.push(cursorPredicate(params.sort, decoded));
  }

  return and(...clauses)!;
}

/** ORDER BY for a sort: primary key column then the `id` tiebreaker, same dir. */
export function buildOrderBy(sort: ListingSort): SQL[] {
  const { column, direction } = SORTS[sort];
  const dir = direction === "asc" ? asc : desc;
  return [dir(column), dir(listings.id)];
}
