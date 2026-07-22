/**
 * Data + side-effects for inquiry (lead) creation (spec §4.2.2, §6, §9).
 *
 * The lead insert and the listing's denormalized `lead_count` bump run in one
 * transaction (spec §6 keeps counters transactional so browse pages never
 * aggregate). Both notification emails are enqueued *after* commit and
 * best-effort: a Redis hiccup must never turn a committed lead into a 500 — the
 * lead is the source of truth and the mail is retryable queue work, mirroring
 * the Phase 1 admin-moderation producer.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, listings, users } from "@/lib/db/schema";
import {
  newMetaEventId,
  serialize,
  type InquiryInput,
  type LeadRow,
  type PreferredContact,
} from "@/lib/leads";
import { enqueue } from "@/lib/queue";
import {
  buyerInquiriesUrl,
  inquiryConfirmationEmail,
  leadNotificationEmail,
  sellerLeadsUrl,
  type RenderedEmail,
} from "@/lib/email/templates";

/** Minimal listing shape the inquiry flow needs — never a raw row to callers. */
export interface InquiryListing {
  id: string;
  sellerId: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
}

/** The signed-in caller's contact + verification facts. */
export interface InquirerContact {
  name: string;
  email: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
}

/**
 * Load an *active*, non-deleted listing by id, or `null`. Drafts, paused, sold,
 * pending, rejected, and expired listings are not inquirable — the public
 * landing page only exists for active listings.
 */
export async function loadActiveListing(
  listingId: string,
): Promise<InquiryListing | null> {
  const [row] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      title: listings.title,
      slug: listings.slug,
      price: listings.price,
      currency: listings.currency,
    })
    .from(listings)
    .where(
      and(
        eq(listings.id, listingId),
        eq(listings.status, "active"),
        isNull(listings.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...row, price: Number(row.price) };
}

/** Load the caller's contact details + phone-verification timestamp. */
export async function loadInquirerContact(
  userId: string,
): Promise<InquirerContact | null> {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      phoneVerifiedAt: users.phoneVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** Load the seller's name + email for the lead-notification address. */
export async function loadSellerContact(
  sellerId: string,
): Promise<{ name: string; email: string } | null> {
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, sellerId))
    .limit(1);
  return row ?? null;
}

export interface CreateLeadArgs {
  listingId: string;
  sellerId: string;
  buyerId: string;
  inquiry: InquiryInput;
  clientIp: string | null;
  clientUa: string | null;
}

/**
 * Insert the lead and bump the listing's `lead_count`, atomically. `consent_at`
 * is stamped now (the schema guarantees an explicit `true`), a `meta_event_id`
 * ULID is minted for Meta CAPI dedup (§5.3), and `status` defaults to `new`.
 */
export async function createLead(args: CreateLeadArgs): Promise<LeadRow> {
  const { listingId, sellerId, buyerId, inquiry, clientIp, clientUa } = args;

  return db.transaction(async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        listingId,
        buyerId,
        sellerId,
        offerAmount:
          inquiry.offerAmount != null ? String(inquiry.offerAmount) : null,
        message: inquiry.message ?? null,
        contactName: inquiry.contactName,
        contactPhone: inquiry.contactPhone,
        contactEmail: inquiry.contactEmail ?? null,
        preferredContact: inquiry.preferredContact,
        consentAt: new Date(),
        status: "new",
        metaEventId: newMetaEventId(),
        clientIp,
        clientUa,
      })
      .returning();

    await tx
      .update(listings)
      .set({ leadCount: sql`${listings.leadCount} + 1` })
      .where(eq(listings.id, listingId));

    return lead!;
  });
}

/** Re-export the shared serializer so the route renders from one wire shape. */
export { serialize };

const PREFERRED_CONTACT_LABELS: Record<PreferredContact, string> = {
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
};

/** Human label for the buyer's chosen channel, shown in the seller email. */
export function preferredContactLabel(value: PreferredContact): string {
  return PREFERRED_CONTACT_LABELS[value];
}

export interface DispatchInquiryEmailsInput {
  sellerName: string;
  sellerEmail: string;
  buyerName: string;
  buyerAccountEmail: string;
  contactPhone: string;
  contactEmail: string | null;
  preferredContactLabel: string;
  offerText: string | null;
  message: string | null;
  listingTitle: string;
  listingUrl: string;
}

/** Enqueue the seller notification + the buyer confirmation, best-effort. */
export async function dispatchInquiryEmails(
  input: DispatchInquiryEmailsInput,
): Promise<void> {
  const sellerMail = leadNotificationEmail({
    sellerName: input.sellerName,
    buyerName: input.buyerName,
    listingTitle: input.listingTitle,
    listingUrl: input.listingUrl,
    offerText: input.offerText,
    message: input.message,
    preferredContact: input.preferredContactLabel,
    buyerPhone: input.contactPhone,
    buyerEmail: input.contactEmail,
    leadsUrl: sellerLeadsUrl(),
  });
  const buyerMail = inquiryConfirmationEmail({
    buyerName: input.buyerName,
    listingTitle: input.listingTitle,
    listingUrl: input.listingUrl,
    offerText: input.offerText,
    inquiriesUrl: buyerInquiriesUrl(),
  });

  await Promise.all([
    safeEnqueueEmail(input.sellerEmail, sellerMail),
    safeEnqueueEmail(input.buyerAccountEmail, buyerMail),
  ]);
}

async function safeEnqueueEmail(to: string, email: RenderedEmail): Promise<void> {
  try {
    await enqueue("email", "send", {
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    console.error("[listings/leads] failed to enqueue inquiry email", error);
  }
}
