/**
 * Listing slug generation + uniqueness (spec §4.3.1, §6 `listings.slug` unique).
 *
 * Slugs are part of the public, SEO-facing URL, so they must be ascii, kebab,
 * and stable. Uniqueness is ultimately guaranteed by the `listings_slug_key`
 * unique index; this helper just picks a free slug up front so inserts rarely
 * collide.
 */
import { and, eq, like, ne, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { listings } from "@/lib/db/schema";

/** Slugs never exceed this — keeps URLs and the index key bounded. */
const MAX_SLUG_LENGTH = 80;
const FALLBACK_SLUG = "listing";

/**
 * Kebab-case, ascii-folded slug from arbitrary text.
 * "Prime 3-Acre Plot, Nashik!" → "prime-3-acre-plot-nashik".
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    // strip combining diacritical marks left by NFKD
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // any run of non-alphanumerics collapses to a single hyphen
    .replace(/[^a-z0-9]+/g, "-")
    // trim leading/trailing hyphens
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    // a mid-word truncation can leave a trailing hyphen
    .replace(/-+$/g, "");

  return slug || FALLBACK_SLUG;
}

/**
 * Given a desired `base` and the set of slugs already taken (base and its
 * `base-N` variants), return the first free slug. Pure so it is unit-testable
 * without a database.
 */
export function pickAvailableSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Astronomically unlikely — fall back to a random suffix.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Resolve a unique slug for `title`. Reads existing `base` / `base-%` slugs in
 * one query (including soft-deleted rows, which still hold their slug in the
 * unique index) and picks the first free one. Pass `excludeId` when editing so
 * a listing does not collide with its own current slug.
 */
export async function uniqueListingSlug(
  db: Db,
  title: string,
  options?: { excludeId?: string },
): Promise<string> {
  const base = slugify(title);
  const excludeId = options?.excludeId;

  const matchBase = or(eq(listings.slug, base), like(listings.slug, `${base}-%`));
  const where = excludeId ? and(matchBase, ne(listings.id, excludeId)) : matchBase;

  const rows = await db.select({ slug: listings.slug }).from(listings).where(where);
  const taken = new Set(rows.map((row) => row.slug));

  return pickAvailableSlug(base, taken);
}
