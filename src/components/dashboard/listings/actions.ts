/**
 * Derives the seller-available status actions for a listing from the shared
 * state machine, so the dashboard buttons can never offer an illegal or
 * admin-only move. This is the UI mirror of the server's `resolveSellerTransition`
 * — both draw from `LISTING_TRANSITIONS` + `SELLER_ACTIONS` (the single source
 * of truth), the server enforces, this presents.
 */
import {
  allowedTransitions,
  transitionAction,
  type ListingAction,
  type ListingStatus,
} from "@/lib/listings";
import { SELLER_ACTIONS } from "@/app/api/dashboard/listings/_lib/transitions";

export interface SellerActionOption {
  action: ListingAction;
  /** The target status this action moves the listing to. */
  to: ListingStatus;
  label: string;
  /** Whether this move needs ≥1 photo before the server will accept it. */
  requiresPhotos: boolean;
}

const ACTION_LABELS: Record<ListingAction, string> = {
  submit: "Submit for review",
  approve: "Approve",
  reject: "Reject",
  pause: "Pause",
  reactivate: "Reactivate",
  mark_sold: "Mark as sold",
  expire: "Expire",
  renew: "Renew",
  resubmit: "Resubmit for review",
};

/** Seller-permitted next actions for a listing in `status`. */
export function sellerActionsFor(status: ListingStatus): SellerActionOption[] {
  return allowedTransitions(status)
    .map((to): SellerActionOption | null => {
      const action = transitionAction(status, to);
      if (action === null || !SELLER_ACTIONS.has(action)) return null;
      return {
        action,
        to,
        label: ACTION_LABELS[action],
        requiresPhotos: to === "pending_review",
      };
    })
    .filter((option): option is SellerActionOption => option !== null);
}
