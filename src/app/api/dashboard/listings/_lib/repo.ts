/**
 * Ownership-scoped data access for seller listings (task OVYRO-261f).
 *
 * Every read and write is filtered by `sellerId` *and* `deleted_at IS NULL`, so
 * a seller can only ever touch their own, live listings — a listing owned by
 * someone else (or soft-deleted) simply resolves to `null`, which the route
 * layer turns into a 404. Deletes are soft (R-12): listings with leads must
 * stay resolvable, so we only ever stamp `deleted_at`, never `DELETE`.
 *
 * `listing_media` is read-only here (photo counts, cover derivation) — media
 * mutation is owned by the media builder, not this feature.
 */
import { and, asc, desc, eq, inArray, isNull, type InferInsertModel } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { listingMedia, listings } from "@/lib/db/schema";
import {
  uniqueListingSlug,
  type ListingCreateInput,
  type ListingEditInput,
  type ListingMediaRow,
  type ListingRow,
  type ListingStatus,
} from "@/lib/listings";

type ListingUpdate = Partial<InferInsertModel<typeof listings>>;

/** A live listing owned by `sellerId`. */
const ownedListing = (sellerId: string, id: string) =>
  and(
    eq(listings.id, id),
    eq(listings.sellerId, sellerId),
    isNull(listings.deletedAt),
  );

/** All of a seller's live listings, newest first (ULIDs sort chronologically). */
export async function listSellerListings(
  db: Db,
  sellerId: string,
): Promise<ListingRow[]> {
  return db
    .select()
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), isNull(listings.deletedAt)))
    .orderBy(desc(listings.createdAt));
}

/** A single owned listing, or `null` when missing / not theirs / deleted. */
export async function getSellerListing(
  db: Db,
  sellerId: string,
  id: string,
): Promise<ListingRow | null> {
  const [row] = await db
    .select()
    .from(listings)
    .where(ownedListing(sellerId, id))
    .limit(1);
  return row ?? null;
}

/** Every media row for a listing, in display order. Read-only. */
export async function getListingMedia(
  db: Db,
  listingId: string,
): Promise<ListingMediaRow[]> {
  return db
    .select()
    .from(listingMedia)
    .where(eq(listingMedia.listingId, listingId))
    .orderBy(asc(listingMedia.sortOrder));
}

/** How many photos a listing has — the gate for submitting to review. */
export async function countListingPhotos(
  db: Db,
  listingId: string,
): Promise<number> {
  const rows = await db
    .select({ id: listingMedia.id })
    .from(listingMedia)
    .where(and(eq(listingMedia.listingId, listingId), eq(listingMedia.kind, "photo")));
  return rows.length;
}

/**
 * Cover photo (first uploaded photo with a resolved URL) for each listing, in a
 * single query — used to hydrate the dashboard list without N media round-trips.
 */
export async function listCoverPhotos(
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
    .orderBy(asc(listingMedia.sortOrder));

  for (const row of rows) {
    // First photo (by sort order) that already has a URL wins the cover slot.
    if (row.url !== null && !covers.has(row.listingId)) {
      covers.set(row.listingId, row);
    }
  }
  return covers;
}

/** Create a draft listing for `sellerId` with a unique slug. */
export async function createSellerListing(
  db: Db,
  sellerId: string,
  input: ListingCreateInput,
): Promise<ListingRow> {
  const slug = await uniqueListingSlug(db, input.title);
  const { price, area, ...rest } = input;

  const [row] = await db
    .insert(listings)
    .values({
      ...rest,
      sellerId,
      slug,
      // numeric(*) columns are text on the wire — stringify the wizard's numbers.
      price: String(price),
      area: String(area),
    })
    .returning();
  return row;
}

/**
 * Apply a validated PATCH to an owned listing. An empty patch is a no-op that
 * just returns the current row. Slugs are intentionally *not* regenerated on a
 * title change — they are the stable, SEO-facing URL. Returns `null` when the
 * listing is not the seller's (→ 404).
 */
export async function updateSellerListing(
  db: Db,
  sellerId: string,
  id: string,
  patch: ListingEditInput,
): Promise<ListingRow | null> {
  const { price, area, ...rest } = patch;
  const set: ListingUpdate = { ...rest };
  if (price !== undefined) set.price = String(price);
  if (area !== undefined) set.area = String(area);

  if (Object.keys(set).length === 0) {
    return getSellerListing(db, sellerId, id);
  }

  const [row] = await db
    .update(listings)
    .set(set)
    .where(ownedListing(sellerId, id))
    .returning();
  return row ?? null;
}

/** Soft-delete (R-12): stamp `deleted_at`, never hard-delete. */
export async function softDeleteSellerListing(
  db: Db,
  sellerId: string,
  id: string,
): Promise<ListingRow | null> {
  const [row] = await db
    .update(listings)
    .set({ deletedAt: new Date() })
    .where(ownedListing(sellerId, id))
    .returning();
  return row ?? null;
}

/**
 * Persist a status move. `clearRejectedReason` wipes stale moderation feedback
 * when a listing re-enters review (submit/renew/resubmit) so the seller does
 * not see an old rejection note against a fresh submission.
 */
export async function setListingStatus(
  db: Db,
  sellerId: string,
  id: string,
  to: ListingStatus,
  opts: { clearRejectedReason: boolean },
): Promise<ListingRow | null> {
  const set: ListingUpdate = { status: to };
  if (opts.clearRejectedReason) set.rejectedReason = null;

  const [row] = await db
    .update(listings)
    .set(set)
    .where(ownedListing(sellerId, id))
    .returning();
  return row ?? null;
}
