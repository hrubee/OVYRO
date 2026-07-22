/**
 * Shared saved-list DTOs + serializers (spec §4.2.3, §6).
 *
 * `serializeList` / `serializeSavedItem` turn Drizzle rows into JSON-safe shapes
 * that the buyer account page and the `/api/me/lists` handlers both render from,
 * so the two surfaces can never disagree on the wire format. Conversions:
 *   - `price_at_save` numeric arrives from pg as a string → coerced to `number`
 *   - timestamptz columns arrive as `Date` → emitted as ISO-8601 strings
 */
import type { InferSelectModel } from "drizzle-orm";
import { listItems, lists } from "@/lib/db/schema";
import type { ListingStatus } from "@/lib/listings";

export type ListRow = InferSelectModel<typeof lists>;
export type ListItemRow = InferSelectModel<typeof listItems>;

/** A saved list plus how many listings it holds. */
export interface ListDTO {
  id: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The listing side of a saved item, condensed and public-safe. `removed` is set
 * when the underlying listing was soft-deleted (R-12) — the buyer still sees the
 * row, greyed out, rather than having it silently vanish.
 */
export interface SavedListingDTO {
  id: string;
  slug: string;
  title: string;
  status: ListingStatus;
  removed: boolean;
  price: number;
  currency: string;
  coverImageUrl: string | null;
}

/** A saved-list entry: the snapshot price plus the (possibly stale) listing. */
export interface SavedItemDTO {
  id: string;
  listId: string;
  listingId: string;
  priceAtSave: number | null;
  savedAt: string;
  listing: SavedListingDTO;
}

const numOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

/** Serialize a list row; `itemCount` is supplied by the caller's aggregate. */
export function serializeList(row: ListRow, itemCount: number): ListDTO {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    itemCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Serialize a saved item; `listing` is resolved (and possibly `removed`). */
export function serializeSavedItem(
  row: ListItemRow,
  listing: SavedListingDTO,
): SavedItemDTO {
  return {
    id: row.id,
    listId: row.listId,
    listingId: row.listingId,
    priceAtSave: numOrNull(row.priceAtSave),
    savedAt: row.createdAt.toISOString(),
    listing,
  };
}
