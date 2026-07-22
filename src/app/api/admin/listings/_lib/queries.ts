/**
 * Read-side of the moderation queue. Kept apart from `moderation.ts` (the write
 * service) so the admin page can render the queue without importing the queue /
 * email producers — it only needs the DB.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, users } from "@/lib/db/schema";
import type { ListingRow, ListingStatus } from "@/lib/listings";
import type { ModerationListing } from "./types";

type SellerRef = { id: string; name: string; email: string };

/** Row + joined seller -> the admin wire shape. */
export function toModerationListing(row: ListingRow, seller: SellerRef): ModerationListing {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    price: Number(row.price),
    currency: row.currency,
    landType: row.landType,
    area: Number(row.area),
    areaUnit: row.areaUnit,
    city: row.city,
    region: row.region,
    seller: { id: seller.id, name: seller.name, email: seller.email },
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    rejectedReason: row.rejectedReason,
  };
}

export interface ListModerationOptions {
  /** Defaults to `pending_review` — the moderation queue's primary job. */
  status?: ListingStatus;
  limit?: number;
}

/**
 * List listings in a given status for moderation, oldest first (review the
 * longest-waiting listing next). Excludes soft-deleted rows.
 */
export async function listModerationListings(
  options: ListModerationOptions = {},
): Promise<ModerationListing[]> {
  const status = options.status ?? "pending_review";
  const limit = options.limit ?? 100;

  const rows = await db
    .select({
      listing: listings,
      seller: { id: users.id, name: users.name, email: users.email },
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(and(eq(listings.status, status), isNull(listings.deletedAt)))
    .orderBy(asc(listings.createdAt))
    .limit(limit);

  return rows.map((row) => toModerationListing(row.listing, row.seller));
}
