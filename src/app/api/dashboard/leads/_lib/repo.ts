/**
 * Ownership-scoped data access for the seller lead inbox (task OVYRO-9e62).
 *
 * Every read and write is filtered by the denormalized `leads.seller_id` — the
 * hottest seller query (spec §6 notes), backed by the
 * `leads_seller_id_created_at_idx` index. A lead on a listing owned by someone
 * else simply resolves to `null`, which the route layer turns into a 404, so a
 * seller can only ever see or touch leads on their own listings.
 *
 * `listings` is read-only here (the filter dropdown needs id + title); lead
 * *creation* and listing mutation are owned by other builders, not this feature.
 * Note leads are scoped by `seller_id` alone, never by the listing's
 * `deleted_at`: a lead outlives a soft-deleted listing and must stay visible.
 */
import { and, desc, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { leads, listings } from "@/lib/db/schema";
import type { LeadRow, LeadStatus } from "@/lib/leads";
import type { LeadFilters } from "./filters";

/** A lead owned by `sellerId` (denormalized), regardless of listing state. */
const ownedLead = (sellerId: string, id: string) =>
  and(eq(leads.id, id), eq(leads.sellerId, sellerId));

/** id + title for each of a seller's live listings — the filter dropdown. */
export interface SellerListingOption {
  id: string;
  title: string;
}

/**
 * All of a seller's leads, newest first (ULIDs sort chronologically), narrowed
 * by the optional inbox filters. Listing/status are exact matches; `from`/`to`
 * bound `created_at` inclusively.
 */
export async function listSellerLeads(
  db: Db,
  sellerId: string,
  filters: LeadFilters = {},
): Promise<LeadRow[]> {
  const conditions: SQL[] = [eq(leads.sellerId, sellerId)];
  if (filters.listingId) conditions.push(eq(leads.listingId, filters.listingId));
  if (filters.status) conditions.push(eq(leads.status, filters.status));
  if (filters.from) conditions.push(gte(leads.createdAt, filters.from));
  if (filters.to) conditions.push(lte(leads.createdAt, filters.to));

  return db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt));
}

/** A single owned lead, or `null` when missing / not on the seller's listings. */
export async function getSellerLead(
  db: Db,
  sellerId: string,
  id: string,
): Promise<LeadRow | null> {
  const [row] = await db.select().from(leads).where(ownedLead(sellerId, id)).limit(1);
  return row ?? null;
}

/**
 * Stamp `seller_first_viewed_at` the first time a seller opens a lead — the
 * "seller viewed it" signal the admin funnel reads (spec §4.1.4). Idempotent:
 * the `IS NULL` guard means a re-read never moves the timestamp, so it records a
 * genuine *first* view. Returns the current row (freshly stamped or already
 * viewed), or `null` when the lead is not the seller's (→ 404).
 */
export async function markLeadFirstViewed(
  db: Db,
  sellerId: string,
  id: string,
): Promise<LeadRow | null> {
  const [updated] = await db
    .update(leads)
    .set({ sellerFirstViewedAt: new Date() })
    .where(and(ownedLead(sellerId, id), isNull(leads.sellerFirstViewedAt)))
    .returning();
  // Updated on this call → first view. Otherwise it was already viewed (or not
  // ours): fall back to a plain owned read so a repeat view still returns 200.
  return updated ?? getSellerLead(db, sellerId, id);
}

/**
 * Persist a validated lead status move. The legality of `from → to` is enforced
 * by the caller through leads-core `assertTransition`; this only writes. Returns
 * `null` when the lead is not the seller's (→ 404).
 */
export async function setLeadStatus(
  db: Db,
  sellerId: string,
  id: string,
  to: LeadStatus,
): Promise<LeadRow | null> {
  const [row] = await db
    .update(leads)
    .set({ status: to })
    .where(ownedLead(sellerId, id))
    .returning();
  return row ?? null;
}

/** A seller's live listings (id + title) to populate the inbox filter control. */
export async function listSellerListingOptions(
  db: Db,
  sellerId: string,
): Promise<SellerListingOption[]> {
  return db
    .select({ id: listings.id, title: listings.title })
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), isNull(listings.deletedAt)))
    .orderBy(desc(listings.createdAt));
}
