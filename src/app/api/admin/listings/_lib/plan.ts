/**
 * Pure moderation planning (spec §4.1.3, §4.3.1).
 *
 * Every admin status change routes through the core state machine
 * (`assertTransition`) here, then returns the exact column patch the DB service
 * applies. Dependency-free — no DB, no session — so the transition rules and the
 * 90-day expiry math are unit-testable in isolation, and the service layer stays
 * a thin adapter over these decisions.
 */
import {
  ListingTransitionError,
  assertTransition,
  transitionAction,
  type ListingStatus,
} from "@/lib/listings";

/** Active listings auto-expire this many days after they go live (spec §4.3.1). */
export const EXPIRY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The expiry instant for a listing published at `from`. */
export function computeExpiresAt(from: Date): Date {
  return new Date(from.getTime() + EXPIRY_DAYS * DAY_MS);
}

export interface ApprovalPatch {
  status: "active";
  publishedAt: Date;
  expiresAt: Date;
}

/**
 * Plan an approval: `pending_review -> active`, publishing now and setting the
 * 90-day expiry. Throws `ListingTransitionError` (409) unless the listing is
 * pending review.
 *
 * Note we require the *named* `approve` edge, not just any move into `active`:
 * the core machine also allows `paused -> active`, but that is a seller
 * "reactivate", not an admin approval — approving a paused listing would be a
 * privilege bug.
 */
export function planApproval(current: ListingStatus, now: Date = new Date()): ApprovalPatch {
  if (transitionAction(current, "active") !== "approve") {
    throw new ListingTransitionError(current, "active");
  }
  return { status: "active", publishedAt: now, expiresAt: computeExpiresAt(now) };
}

export interface RejectionPatch {
  status: "rejected";
  rejectedReason: string;
}

/**
 * Plan a rejection: `pending_review -> rejected`, recording the seller-facing
 * reason. Throws `ListingTransitionError` (409) on an illegal source state.
 */
export function planRejection(current: ListingStatus, reason: string): RejectionPatch {
  assertTransition(current, "rejected");
  return { status: "rejected", rejectedReason: reason };
}

/** The moderation-relevant fields, as an audit-log before/after snapshot. */
export interface ModerationSnapshot {
  status: ListingStatus;
  publishedAt: string | null;
  expiresAt: string | null;
  rejectedReason: string | null;
}

export function moderationSnapshot(row: {
  status: ListingStatus;
  publishedAt: Date | null;
  expiresAt: Date | null;
  rejectedReason: string | null;
}): ModerationSnapshot {
  return {
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    rejectedReason: row.rejectedReason,
  };
}
