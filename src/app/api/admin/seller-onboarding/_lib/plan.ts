/**
 * Pure review planning (spec §4.2.4).
 *
 * Every admin decision routes through the onboarding state machine
 * (`@/lib/onboarding`) here, then returns the exact column patch the DB service
 * applies. Dependency-free — no DB, no session — so the transition rules are
 * unit-testable in isolation and the service layer stays a thin adapter.
 *
 * We require the *named* edge (`transitionAction === "approve" | "reject"`),
 * not merely any move into the target state: it is defensive against a future
 * edge into `approved`/`rejected` that would not be an admin review, mirroring
 * the listings moderation planner.
 */
import {
  OnboardingTransitionError,
  transitionAction,
  type OnboardingState,
} from "@/lib/onboarding";

export interface ApprovalPatch {
  state: "approved";
  reviewedBy: string;
}

/**
 * Plan an approval: `submitted -> approved`, recording the reviewing admin.
 * The additive `seller` role is granted by the service layer, not here. Throws
 * `OnboardingTransitionError` (409) unless the application is `submitted`.
 */
export function planApproval(
  current: OnboardingState,
  reviewedBy: string,
): ApprovalPatch {
  if (transitionAction(current, "approved") !== "approve") {
    throw new OnboardingTransitionError(current, "approved");
  }
  return { state: "approved", reviewedBy };
}

export interface RejectionPatch {
  state: "rejected";
  reviewedBy: string;
  reviewNote: string;
}

/**
 * Plan a rejection: `submitted -> rejected`, recording the reviewing admin and
 * the buyer-facing note. Throws `OnboardingTransitionError` (409) on an illegal
 * source state.
 */
export function planRejection(
  current: OnboardingState,
  reviewedBy: string,
  note: string,
): RejectionPatch {
  if (transitionAction(current, "rejected") !== "reject") {
    throw new OnboardingTransitionError(current, "rejected");
  }
  return { state: "rejected", reviewedBy, reviewNote: note };
}

/** The review-relevant fields, as an audit-log before/after snapshot (spec §10). */
export interface ReviewSnapshot {
  state: OnboardingState;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
}

export function reviewSnapshot(row: {
  state: OnboardingState;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: Date | null;
}): ReviewSnapshot {
  return {
    state: row.state,
    reviewedBy: row.reviewedBy,
    reviewNote: row.reviewNote,
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}
