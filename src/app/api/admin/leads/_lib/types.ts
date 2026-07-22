/**
 * Wire shape for the read-only admin leads table (spec §4.1.4). No DB / server
 * imports so the presentational table can `import type` these freely.
 *
 * This is a *dispute-resolution* view, not a management one: it surfaces the
 * delivery + seller-viewed facts an admin needs to adjudicate "the seller says
 * they never got my inquiry", and deliberately exposes no status editing.
 */
import type { LeadStatus } from "@/lib/leads";

export interface AdminLeadRow {
  id: string;
  listing: { id: string; title: string; slug: string; currency: string };
  buyer: { id: string; name: string; email: string };
  seller: { id: string; name: string; email: string };
  offerAmount: number | null;
  message: string | null;
  contactPhone: string;
  status: LeadStatus;
  createdAt: string;
  /** Lead-notification email delivered to the seller? (`email_delivered_at`). */
  emailDelivered: boolean;
  emailDeliveredAt: string | null;
  /** Has the seller opened the lead? (`seller_first_viewed_at`). */
  sellerViewed: boolean;
  sellerViewedAt: string | null;
}

export interface AdminLeadFilters {
  /** Free-text across listing title + buyer/seller email. */
  q?: string;
  status?: LeadStatus;
}
