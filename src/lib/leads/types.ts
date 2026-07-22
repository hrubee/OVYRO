/**
 * Shared Lead DTO + serializer (spec §4.2.2, §6).
 *
 * `serialize` turns a Drizzle `leads` row into a JSON-safe shape that the seller
 * lead inbox and the buyer account both render from, so the two surfaces can
 * never disagree on the wire format. Conversions handled here:
 *   - `offer_amount` numeric arrives from pg as a string → coerced to `number`
 *   - timestamptz columns arrive as `Date` → emitted as ISO-8601 strings
 *
 * The raw attribution fields (`meta_event_id`, `fbp`, `fbc`, `client_ip`,
 * `client_ua`) are server-internal — the Meta CAPI dedup/match keys — and are
 * deliberately dropped from the DTO so they never reach a browser.
 */
import type { InferSelectModel } from "drizzle-orm";
import { leads, preferredContact } from "@/lib/db/schema";
import type { LeadStatus } from "./status";

export type LeadRow = InferSelectModel<typeof leads>;

export type PreferredContact = (typeof preferredContact.enumValues)[number];

export interface LeadDTO {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerAmount: number | null;
  message: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  preferredContact: PreferredContact;
  status: LeadStatus;
  consentAt: string;
  sellerFirstViewedAt: string | null;
  emailDeliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const numOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

/** Serialize a lead for owner/buyer surfaces; attribution fields are omitted. */
export function serialize(row: LeadRow): LeadDTO {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    offerAmount: numOrNull(row.offerAmount),
    message: row.message,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    preferredContact: row.preferredContact,
    status: row.status,
    consentAt: row.consentAt.toISOString(),
    sellerFirstViewedAt: isoOrNull(row.sellerFirstViewedAt),
    emailDeliveredAt: isoOrNull(row.emailDeliveredAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
