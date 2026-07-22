/**
 * Read-side of the platform-wide admin leads table (spec §4.1.4). READ-ONLY —
 * there is no write service here on purpose: this view is for dispute
 * resolution, not lead management, so it never edits lead status.
 *
 * Buyer and seller both reference `users`, so the table is joined twice via
 * aliases. Delivery/viewed facts come straight off the lead row
 * (`email_delivered_at`, `seller_first_viewed_at`).
 */
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { leads, listings, users } from "@/lib/db/schema";
import type { AdminLeadFilters, AdminLeadRow } from "./types";

const DEFAULT_LIMIT = 200;

/**
 * List leads across the whole platform, newest first, with optional free-text
 * (listing title / buyer / seller email) and status filters.
 */
export async function listAllLeads(
  filters: AdminLeadFilters = {},
): Promise<AdminLeadRow[]> {
  const buyer = alias(users, "buyer");
  const seller = alias(users, "seller");

  const where = [];
  if (filters.q && filters.q.trim().length > 0) {
    const term = `%${filters.q.trim()}%`;
    where.push(
      or(
        ilike(listings.title, term),
        ilike(buyer.email, term),
        ilike(seller.email, term),
      ),
    );
  }
  if (filters.status) {
    where.push(eq(leads.status, filters.status));
  }

  const rows = await db
    .select({
      id: leads.id,
      offerAmount: leads.offerAmount,
      message: leads.message,
      contactPhone: leads.contactPhone,
      status: leads.status,
      createdAt: leads.createdAt,
      emailDeliveredAt: leads.emailDeliveredAt,
      sellerFirstViewedAt: leads.sellerFirstViewedAt,
      listingId: listings.id,
      listingTitle: listings.title,
      listingSlug: listings.slug,
      listingCurrency: listings.currency,
      buyerId: buyer.id,
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      sellerId: seller.id,
      sellerName: seller.name,
      sellerEmail: seller.email,
    })
    .from(leads)
    .innerJoin(listings, eq(listings.id, leads.listingId))
    .innerJoin(buyer, eq(buyer.id, leads.buyerId))
    .innerJoin(seller, eq(seller.id, leads.sellerId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(leads.createdAt))
    .limit(DEFAULT_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    listing: {
      id: row.listingId,
      title: row.listingTitle,
      slug: row.listingSlug,
      currency: row.listingCurrency,
    },
    buyer: { id: row.buyerId, name: row.buyerName, email: row.buyerEmail },
    seller: { id: row.sellerId, name: row.sellerName, email: row.sellerEmail },
    offerAmount: row.offerAmount === null ? null : Number(row.offerAmount),
    message: row.message,
    contactPhone: row.contactPhone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    emailDelivered: row.emailDeliveredAt !== null,
    emailDeliveredAt: row.emailDeliveredAt?.toISOString() ?? null,
    sellerViewed: row.sellerFirstViewedAt !== null,
    sellerViewedAt: row.sellerFirstViewedAt?.toISOString() ?? null,
  }));
}
