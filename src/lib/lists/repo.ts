/**
 * User-scoped data access for saved lists (spec §4.2.3).
 *
 * Every read and write is filtered by `userId`, so a buyer can only ever touch
 * their own lists — a list owned by someone else simply resolves to `null`,
 * which the route layer turns into a 404. Custom lists are hard-deleted (their
 * `list_items` cascade) because the (user_id, name) unique index would otherwise
 * let a soft-deleted name block re-creating a list with the same name; R-12
 * soft-delete is about listings/leads resolvability, not a buyer's own folders.
 *
 * `price_at_save` snapshots the listing's asking price the moment it is saved,
 * so the account page can show that the price moved since (spec §6 note).
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { listItems, listings, listingMedia, lists } from "@/lib/db/schema";
import type { ListingRow } from "@/lib/listings";
import { DefaultListError, ListConflictError, isUniqueViolation } from "./errors";
import { DEFAULT_LIST_NAME, DEFAULT_LIST_TOKEN } from "./schema";
import {
  serializeList,
  serializeSavedItem,
  type ListDTO,
  type ListItemRow,
  type ListRow,
  type SavedItemDTO,
  type SavedListingDTO,
} from "./types";

/** A single owned, non-deleted list, or `null` when missing / not theirs. */
export async function getOwnedList(
  db: Db,
  userId: string,
  listId: string,
): Promise<ListRow | null> {
  const [row] = await db
    .select()
    .from(lists)
    .where(
      and(eq(lists.id, listId), eq(lists.userId, userId), isNull(lists.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The user's default wishlist, creating it on first use (spec §4.2.3: "a default
 * list on first save"). Race-safe: a concurrent create loses the unique-index
 * insert and re-reads the winner's row.
 */
export async function getOrCreateDefaultList(
  db: Db,
  userId: string,
): Promise<ListRow> {
  const existing = await findDefaultList(db, userId);
  if (existing) return existing;

  const [created] = await db
    .insert(lists)
    .values({ userId, name: DEFAULT_LIST_NAME, isDefault: true })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Lost the create race, or a custom list already claimed the default name.
  const afterRace = await findDefaultList(db, userId);
  if (afterRace) return afterRace;

  const [byName] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.userId, userId), eq(lists.name, DEFAULT_LIST_NAME)))
    .limit(1);
  return byName;
}

async function findDefaultList(db: Db, userId: string): Promise<ListRow | null> {
  const [row] = await db
    .select()
    .from(lists)
    .where(
      and(
        eq(lists.userId, userId),
        eq(lists.isDefault, true),
        isNull(lists.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Resolve a write target from a URL segment: the reserved `default` token maps
 * to the auto-created wishlist, anything else to an owned list (or `null`).
 */
export async function resolveListForWrite(
  db: Db,
  userId: string,
  token: string,
): Promise<ListRow | null> {
  if (token === DEFAULT_LIST_TOKEN) return getOrCreateDefaultList(db, userId);
  return getOwnedList(db, userId, token);
}

/**
 * All of a user's lists (default first, then newest), each with its item count.
 * Ensures the default wishlist exists so the UI always has somewhere to save to.
 */
export async function listUserLists(
  db: Db,
  userId: string,
): Promise<ListDTO[]> {
  await getOrCreateDefaultList(db, userId);

  const rows = await db
    .select()
    .from(lists)
    .where(and(eq(lists.userId, userId), isNull(lists.deletedAt)))
    .orderBy(desc(lists.isDefault), asc(lists.createdAt));

  const countRows = await db
    .select({
      listId: listItems.listId,
      count: sql<number>`count(*)::int`,
    })
    .from(listItems)
    .innerJoin(lists, eq(listItems.listId, lists.id))
    .where(and(eq(lists.userId, userId), isNull(lists.deletedAt)))
    .groupBy(listItems.listId);

  const counts = new Map(countRows.map((r) => [r.listId, r.count]));
  return rows.map((row) => serializeList(row, counts.get(row.id) ?? 0));
}

/** Create a custom list; 409 `ListConflictError` when the name is taken. */
export async function createList(
  db: Db,
  userId: string,
  name: string,
): Promise<ListRow> {
  try {
    const [row] = await db
      .insert(lists)
      .values({ userId, name, isDefault: false })
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ListConflictError();
    throw err;
  }
}

/**
 * Rename an owned list. `null` when the list is not the user's (→ 404); throws
 * `DefaultListError` for the wishlist and `ListConflictError` on a name clash.
 */
export async function renameList(
  db: Db,
  userId: string,
  listId: string,
  name: string,
): Promise<ListRow | null> {
  const list = await getOwnedList(db, userId, listId);
  if (!list) return null;
  if (list.isDefault) throw new DefaultListError();

  try {
    const [row] = await db
      .update(lists)
      .set({ name })
      .where(and(eq(lists.id, listId), eq(lists.userId, userId)))
      .returning();
    return row ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ListConflictError();
    throw err;
  }
}

/**
 * Hard-delete an owned custom list (its items cascade). `false` when the list is
 * not the user's (→ 404); throws `DefaultListError` for the wishlist.
 */
export async function deleteList(
  db: Db,
  userId: string,
  listId: string,
): Promise<boolean> {
  const list = await getOwnedList(db, userId, listId);
  if (!list) return false;
  if (list.isDefault) throw new DefaultListError();

  await db.delete(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId)));
  return true;
}

/**
 * Add a listing to a list, snapshotting its current price. Idempotent — a repeat
 * save returns the existing row rather than duplicating. `null` when the listing
 * does not exist or was removed (→ 404).
 */
export async function addItemToList(
  db: Db,
  listId: string,
  listingId: string,
): Promise<ListItemRow | null> {
  const [listing] = await db
    .select({ price: listings.price })
    .from(listings)
    .where(and(eq(listings.id, listingId), isNull(listings.deletedAt)))
    .limit(1);
  if (!listing) return null;

  const [inserted] = await db
    .insert(listItems)
    .values({ listId, listingId, priceAtSave: listing.price })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.listingId, listingId)))
    .limit(1);
  return existing ?? null;
}

/** Remove a listing from a list. `true` when a row was actually deleted. */
export async function removeItemFromList(
  db: Db,
  listId: string,
  listingId: string,
): Promise<boolean> {
  const rows = await db
    .delete(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.listingId, listingId)))
    .returning({ id: listItems.id });
  return rows.length > 0;
}

/** Which of the user's lists already hold `listingId` (drives the save UI). */
export async function getSavedListIdsForListing(
  db: Db,
  userId: string,
  listingId: string,
): Promise<string[]> {
  const rows = await db
    .select({ listId: listItems.listId })
    .from(listItems)
    .innerJoin(lists, eq(listItems.listId, lists.id))
    .where(
      and(
        eq(lists.userId, userId),
        isNull(lists.deletedAt),
        eq(listItems.listingId, listingId),
      ),
    );
  return rows.map((r) => r.listId);
}

/** Cover photo URL per listing: lowest-`sortOrder` photo with a resolved URL. */
async function fetchCoverUrls(
  db: Db,
  listingIds: string[],
): Promise<Map<string, string>> {
  const covers = new Map<string, string>();
  if (listingIds.length === 0) return covers;

  const rows = await db
    .select()
    .from(listingMedia)
    .where(
      and(inArray(listingMedia.listingId, listingIds), eq(listingMedia.kind, "photo")),
    )
    .orderBy(asc(listingMedia.listingId), asc(listingMedia.sortOrder));

  for (const row of rows) {
    if (row.url && !covers.has(row.listingId)) covers.set(row.listingId, row.url);
  }
  return covers;
}

/** The listing side of a saved item — condensed, with `removed` for R-12. */
function toSavedListing(
  row: ListingRow,
  coverImageUrl: string | null,
): SavedListingDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    removed: row.deletedAt !== null,
    price: Number(row.price),
    currency: row.currency,
    coverImageUrl,
  };
}

/**
 * Every saved item across a user's lists, newest first, each resolved to its
 * (possibly removed) listing. The account page groups these by `listId`. One
 * covers query keeps it to a bounded number of round-trips.
 */
export async function listSavedItems(
  db: Db,
  userId: string,
): Promise<SavedItemDTO[]> {
  const rows = await db
    .select({ item: listItems, listing: listings })
    .from(listItems)
    .innerJoin(
      lists,
      and(
        eq(listItems.listId, lists.id),
        eq(lists.userId, userId),
        isNull(lists.deletedAt),
      ),
    )
    .innerJoin(listings, eq(listItems.listingId, listings.id))
    .orderBy(desc(listItems.createdAt));

  const covers = await fetchCoverUrls(
    db,
    rows.map((r) => r.listing.id),
  );

  return rows.map((r) =>
    serializeSavedItem(
      r.item,
      toSavedListing(r.listing, covers.get(r.listing.id) ?? null),
    ),
  );
}
