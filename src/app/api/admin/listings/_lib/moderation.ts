/**
 * Admin moderation write service (spec §4.1.3).
 *
 * `approveListing` / `rejectListing` each run one transaction that: locks the
 * listing row, routes the status change through the core state machine (via
 * `planApproval` / `planRejection`), applies the column patch, and writes an
 * `admin_audit_log` row with a before/after snapshot (spec §10 / §6). The seller
 * notification is enqueued *after* commit — email is retryable queue work and
 * must never hold a DB transaction open or roll back a completed moderation.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import type { Actor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { adminAuditLog, listings, users } from "@/lib/db/schema";
import { enqueue } from "@/lib/queue";
import {
  listingApprovedEmail,
  listingRejectedEmail,
  listingUrl,
  sellerListingsUrl,
  type RenderedEmail,
} from "@/lib/email/templates";
import { NotFoundError } from "./http";
import { moderationSnapshot, planApproval, planRejection } from "./plan";
import { toModerationListing } from "./queries";
import type { ModerationListing } from "./types";

/** POST body for a rejection — a non-empty, bounded reason (emailed to the seller). */
export const rejectInputSchema = z.object({
  reason: z.string().trim().min(1, "A rejection reason is required.").max(1000),
});

export type RejectInput = z.infer<typeof rejectInputSchema>;

type SellerContact = { id: string; name: string; email: string };

/**
 * Best-effort seller notification. A Redis hiccup must not turn a committed
 * moderation into a 500 — the state change is the source of truth and the email
 * is retryable; log and move on.
 */
async function notifySeller(to: string, email: RenderedEmail): Promise<void> {
  try {
    await enqueue("email", "send", {
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    console.error("[admin/listings] failed to enqueue seller email", error);
  }
}

/** Approve a pending listing: publish it, set the 90-day expiry, email the seller. */
export async function approveListing(
  actor: Actor,
  listingId: string,
): Promise<ModerationListing> {
  const { updated, seller } = await db.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(listings)
      .where(and(eq(listings.id, listingId), isNull(listings.deletedAt)))
      .for("update");
    if (!listing) throw new NotFoundError("Listing not found.");

    const patch = planApproval(listing.status);
    const [next] = await tx
      .update(listings)
      .set(patch)
      .where(eq(listings.id, listingId))
      .returning();

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: "listing.approve",
      entityType: "listing",
      entityId: listingId,
      beforeJsonb: moderationSnapshot(listing),
      afterJsonb: moderationSnapshot(next!),
    });

    const [sellerRow] = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, listing.sellerId));

    return { updated: next!, seller: sellerRow };
  });

  if (seller) {
    await notifySeller(
      seller.email,
      listingApprovedEmail({
        sellerName: seller.name,
        listingTitle: updated.title,
        listingUrl: listingUrl(updated.slug),
      }),
    );
  }

  return toModerationListing(updated, seller ?? unknownSeller(updated.sellerId));
}

/** Reject a pending listing: record the reason, email the seller how to fix it. */
export async function rejectListing(
  actor: Actor,
  listingId: string,
  reason: string,
): Promise<ModerationListing> {
  const { updated, seller } = await db.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(listings)
      .where(and(eq(listings.id, listingId), isNull(listings.deletedAt)))
      .for("update");
    if (!listing) throw new NotFoundError("Listing not found.");

    const patch = planRejection(listing.status, reason);
    const [next] = await tx
      .update(listings)
      .set(patch)
      .where(eq(listings.id, listingId))
      .returning();

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: "listing.reject",
      entityType: "listing",
      entityId: listingId,
      beforeJsonb: moderationSnapshot(listing),
      afterJsonb: moderationSnapshot(next!),
    });

    const [sellerRow] = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, listing.sellerId));

    return { updated: next!, seller: sellerRow };
  });

  if (seller) {
    await notifySeller(
      seller.email,
      listingRejectedEmail({
        sellerName: seller.name,
        listingTitle: updated.title,
        reason,
        editUrl: sellerListingsUrl(),
      }),
    );
  }

  return toModerationListing(updated, seller ?? unknownSeller(updated.sellerId));
}

/** Placeholder seller for the (practically impossible) missing-user race after a locked update. */
function unknownSeller(id: string): SellerContact {
  return { id, name: "Unknown seller", email: "" };
}
