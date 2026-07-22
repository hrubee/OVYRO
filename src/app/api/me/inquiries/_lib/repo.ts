/**
 * Buyer-side inquiry history (spec §4.2.2, "My Inquiries").
 *
 * A buyer sees every lead they submitted, newest first, resolved to the listing
 * it was about. Per R-12 a sold or soft-deleted listing still resolves — the row
 * stays visible (the account page greys it out) rather than vanishing — so this
 * joins listings *without* a status/`deleted_at` filter and flags `removed`.
 *
 * The lead itself is serialized through leads-core `serialize`, which drops the
 * server-internal Meta attribution fields, so this surface can never leak them.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { leads, listings, listingMedia } from "@/lib/db/schema";
import { serialize, type LeadDTO } from "@/lib/leads";
import type { ListingStatus } from "@/lib/listings";

/** The listing an inquiry was about — condensed, with `removed` for R-12. */
export interface InquiryListingDTO {
  id: string;
  slug: string;
  title: string;
  status: ListingStatus;
  removed: boolean;
  price: number;
  currency: string;
  coverImageUrl: string | null;
}

export interface BuyerInquiryDTO {
  lead: LeadDTO;
  listing: InquiryListingDTO;
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

/** Every inquiry a buyer submitted, newest first, with its (possibly stale) listing. */
export async function listBuyerInquiries(
  db: Db,
  buyerId: string,
): Promise<BuyerInquiryDTO[]> {
  const rows = await db
    .select({ lead: leads, listing: listings })
    .from(leads)
    .innerJoin(listings, eq(leads.listingId, listings.id))
    .where(eq(leads.buyerId, buyerId))
    .orderBy(desc(leads.createdAt));

  const covers = await fetchCoverUrls(
    db,
    rows.map((r) => r.listing.id),
  );

  return rows.map((r) => ({
    lead: serialize(r.lead),
    listing: {
      id: r.listing.id,
      slug: r.listing.slug,
      title: r.listing.title,
      status: r.listing.status,
      removed: r.listing.deletedAt !== null,
      price: Number(r.listing.price),
      currency: r.listing.currency,
      coverImageUrl: covers.get(r.listing.id) ?? null,
    },
  }));
}
