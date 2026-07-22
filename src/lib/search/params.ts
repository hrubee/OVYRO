/**
 * Public browse query parsing (spec §4.2.1, §7 `GET /api/listings`).
 *
 * The browse page and the `GET /api/listings` handler both turn untrusted query
 * strings into a single typed `ListingSearchParams`. Parsing is deliberately
 * *lenient*: a garbage value (`priceMin=abc`, `sort=banana`, a stale cursor)
 * is silently dropped rather than 400'd, so a shared/edited URL always renders
 * a sane page. Validation that matters for safety (enum membership, bounds,
 * length caps) still holds — malformed input just falls back to the default.
 *
 * The `land_type` / `area_unit` enums come straight from the Drizzle pgEnums so
 * the accepted filter values can never drift from the columns.
 */
import { z } from "zod";
import { areaUnit, landType } from "@/lib/db/schema";

/** Sort keys the UI exposes (spec §4.2.1: newest, price, area, popularity). */
export const LISTING_SORTS = [
  "newest",
  "price_asc",
  "price_desc",
  "area_asc",
  "area_desc",
  "popularity",
] as const;

export type ListingSort = (typeof LISTING_SORTS)[number];

export const DEFAULT_SORT: ListingSort = "newest";
export const DEFAULT_LIMIT = 24;
export const MAX_LIMIT = 48;
const MAX_TEXT = 120;

/** A blank/whitespace query field means "unset", not an empty-string filter. */
function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_TEXT);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Coerce a query value to a finite, non-negative number or drop it. */
const numberParam = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}, z.number().nonnegative().optional());

/** Tri-state boolean filter: only the recognised truthy/falsy tokens count. */
const booleanParam = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const s = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(s)) return true;
  if (["false", "0", "off", "no"].includes(s)) return false;
  return undefined;
}, z.boolean().optional());

const textParam = z.preprocess(cleanText, z.string().min(1).optional());

export const listingSearchSchema = z.object({
  /** Free-text location/keyword search (Postgres full-text, spec §4.2.1). */
  q: textParam,
  /** Region select — exact (case-insensitive) match. */
  region: textParam,
  landType: z.enum(landType.enumValues).optional().catch(undefined),
  areaUnit: z.enum(areaUnit.enumValues).optional().catch(undefined),
  priceMin: numberParam,
  priceMax: numberParam,
  areaMin: numberParam,
  areaMax: numberParam,
  roadAccess: booleanParam,
  water: booleanParam,
  electricity: booleanParam,
  sort: z.enum(LISTING_SORTS).default(DEFAULT_SORT).catch(DEFAULT_SORT),
  /** Opaque keyset cursor from a previous page (see `./query`). */
  cursor: z.preprocess(cleanText, z.string().min(1).optional()),
  limit: z.preprocess((value) => {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const n = Number(value);
    return Number.isInteger(n) ? n : undefined;
  }, z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).catch(DEFAULT_LIMIT)),
});

export type ListingSearchParams = z.infer<typeof listingSearchSchema>;

/** The keys we read off a query string — anything else is ignored. */
const SEARCH_KEYS = [
  "q",
  "region",
  "landType",
  "areaUnit",
  "priceMin",
  "priceMax",
  "areaMin",
  "areaMax",
  "roadAccess",
  "water",
  "electricity",
  "sort",
  "cursor",
  "limit",
] as const;

/** A page's already-resolved `searchParams` (Next 15) or a raw query object. */
export type RawSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function firstValue(raw: RawSearchParams, key: string): string | undefined {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? undefined;
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parse untrusted query params into typed search params. Never throws — the
 * lenient schema falls every field back to its default, so callers always get
 * a usable object.
 */
export function parseListingSearch(raw: RawSearchParams): ListingSearchParams {
  const input: Record<string, string> = {};
  for (const key of SEARCH_KEYS) {
    const value = firstValue(raw, key);
    if (value !== undefined) input[key] = value;
  }
  return listingSearchSchema.parse(input);
}

/**
 * Serialize params back to a query string for building filter/sort/pagination
 * links. Defaults (`sort=newest`, `limit=24`) are omitted to keep URLs clean;
 * pass `overrides` to change one axis (e.g. a new `cursor` or `sort`) while
 * preserving every active filter.
 */
export function listingSearchToQuery(
  params: Partial<ListingSearchParams>,
  overrides: Partial<ListingSearchParams> = {},
): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  for (const key of SEARCH_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null) continue;
    if (key === "sort" && value === DEFAULT_SORT) continue;
    if (key === "limit" && value === DEFAULT_LIMIT) continue;
    search.set(key, String(value));
  }
  return search.toString();
}
