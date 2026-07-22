/**
 * Public browse/detail data access (spec §4.2.1, §7).
 *
 * These are the only functions that touch the database for the public surface.
 * They take a `Db` handle as a parameter (type-only import, so this module
 * pulls in no pool at import time and stays test-safe) and return the shared,
 * public-safe DTOs from listings-core — never a raw row.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { listingMedia, listings, sellerProfiles, users } from "@/lib/db/schema";
import {
  serialize,
  serializeSummary,
  type ListingDTO,
  type ListingMediaRow,
  type ListingSummary,
} from "@/lib/listings";
import type { ListingSearchParams } from "./params";
import { buildListingWhere, buildOrderBy, encodeCursor } from "./query";

export interface ListingSearchResult {
  items: ListingSummary[];
  /** Opaque cursor for the next page, or `null` when the last page is reached. */
  nextCursor: string | null;
}

/**
 * Public listing detail = the seller landing page payload. `rejectedReason`
 * (owner/admin-only moderation feedback) is dropped; the seller's display name
 * is resolved for the page header.
 */
export type PublicListingDetail = Omit<ListingDTO, "rejectedReason"> & {
  seller: { displayName: string };
};

/**
 * Cover photo per listing: the lowest-`sortOrder` photo that has a resolved
 * URL (mirrors listings-core `coverUrl`). One query for the whole page.
 */
async function fetchCovers(
  db: Db,
  listingIds: string[],
): Promise<Map<string, ListingMediaRow>> {
  const covers = new Map<string, ListingMediaRow>();
  if (listingIds.length === 0) return covers;

  const rows = await db
    .select()
    .from(listingMedia)
    .where(
      and(inArray(listingMedia.listingId, listingIds), eq(listingMedia.kind, "photo")),
    )
    .orderBy(listingMedia.listingId, listingMedia.sortOrder);

  for (const row of rows) {
    if (row.url && !covers.has(row.listingId)) covers.set(row.listingId, row);
  }
  return covers;
}

/**
 * Run a public browse query: filters + sort + keyset pagination. Fetches one
 * extra row to decide whether a next page exists without a second count query.
 */
export async function searchPublicListings(
  db: Db,
  params: ListingSearchParams,
): Promise<ListingSearchResult> {
  const rows = await db
    .select()
    .from(listings)
    .where(buildListingWhere(params))
    .orderBy(...buildOrderBy(params.sort))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  const covers = await fetchCovers(
    db,
    page.map((row) => row.id),
  );
  const items = page.map((row) => serializeSummary(row, covers.get(row.id) ?? null));

  const last = page.at(-1);
  const nextCursor = hasMore && last ? encodeCursor(params.sort, last) : null;

  return { items, nextCursor };
}

/** Seller display name: profile name, else the user's name, else a fallback. */
async function fetchSellerDisplayName(db: Db, sellerId: string): Promise<string> {
  const [row] = await db
    .select({ displayName: sellerProfiles.displayName, name: users.name })
    .from(users)
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(eq(users.id, sellerId))
    .limit(1);
  return row?.displayName ?? row?.name ?? "Ovyro Seller";
}

/**
 * Load a public listing landing page by slug, or `null` if no *active*,
 * non-deleted listing owns that slug (drafts/pending/paused/sold/rejected/
 * expired are never reachable). Does not touch `view_count` — see
 * `incrementListingView`.
 */
export async function getPublicListingDetail(
  db: Db,
  slug: string,
): Promise<PublicListingDetail | null> {
  const [row] = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.slug, slug),
        eq(listings.status, "active"),
        isNull(listings.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [media, displayName] = await Promise.all([
    db.select().from(listingMedia).where(eq(listingMedia.listingId, row.id)),
    fetchSellerDisplayName(db, row.sellerId),
  ]);

  const { rejectedReason, ...pub } = serialize(row, media);
  void rejectedReason; // owner/admin-only moderation note — never public.
  return { ...pub, seller: { displayName } };
}

/**
 * Bump the denormalized `view_count` on a detail view. Uses a raw increment so
 * it does not trip the `updated_at` `$onUpdate` hook — a page view is not a
 * content edit, and R-8 keys cache revalidation off `updated_at`.
 */
export async function incrementListingView(db: Db, id: string): Promise<void> {
  // Bare column names: Postgres forbids a table-qualified SET target, and both
  // sides resolve against the UPDATE's target table.
  await db.execute(
    sql`update ${listings} set view_count = view_count + 1 where id = ${id}`,
  );
}

/** Distinct regions across active listings, for the browse region select. */
export async function fetchActiveRegions(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ region: listings.region })
    .from(listings)
    .where(and(eq(listings.status, "active"), isNull(listings.deletedAt)));
  return rows
    .map((row) => row.region)
    .filter((region): region is string => !!region && region.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
}
