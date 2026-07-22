/**
 * Seller-side status-transition policy (task OVYRO-261f, spec §4.3.1).
 *
 * The *legal* moves live in `@/lib/listings` (the shared state machine). This
 * module layers the seller-specific policy on top, and does so as a pure,
 * DB-free function so it is exhaustively unit-testable:
 *
 *   1. The move must be legal at all       → `assertTransition` (409 if not).
 *   2. It must be a *seller* action        → not admin approve/reject or the
 *      worker's expire (403 if it is one of those).
 *   3. Any move *into* `pending_review`    → requires ≥1 photo (422 if none).
 *      This is the single acceptance rule "draft → pending_review only with
 *      1+ photos", and it also covers renew/resubmit which re-enter review.
 *
 * The route handler owns the DB (fetch current status, count photos, persist);
 * this function owns only the decision.
 */
import {
  ListingTransitionError,
  assertTransition,
  transitionAction,
  type ListingAction,
  type ListingStatus,
} from "@/lib/listings";

/**
 * The subset of state-machine actions a seller may perform. `approve`/`reject`
 * are admin moves and `expire` is the worker's — a seller invoking one is a 403,
 * even though the raw from→to edge is legal in the shared machine.
 */
export const SELLER_ACTIONS: ReadonlySet<ListingAction> = new Set<ListingAction>([
  "submit",
  "pause",
  "reactivate",
  "mark_sold",
  "renew",
  "resubmit",
]);

/** A legal move, but not one a seller is allowed to trigger (admin/worker only). */
export class SellerActionError extends Error {
  readonly code = "FORBIDDEN_TRANSITION";
  readonly status = 403;

  constructor(action: ListingAction) {
    super(`The "${action}" transition is not available to sellers.`);
    this.name = "SellerActionError";
  }
}

/** Submitting for review needs at least one photo (spec §4.3.1 acceptance). */
export class PhotosRequiredError extends Error {
  readonly code = "PHOTOS_REQUIRED";
  readonly status = 422;

  constructor() {
    super("Add at least one photo before submitting this listing for review.");
    this.name = "PhotosRequiredError";
  }
}

/**
 * Validate a seller-requested move from `from` to `to` and return the named
 * action. Throws (never returns) when the move is illegal, not a seller action,
 * or would enter review without a photo.
 */
export function resolveSellerTransition(
  from: ListingStatus,
  to: ListingStatus,
  opts: { photoCount: number },
): ListingAction {
  // 1. Legal in the shared machine at all? (409 otherwise.)
  assertTransition(from, to);

  // assertTransition passed, so a named edge exists — this is never null.
  const action = transitionAction(from, to);
  if (action === null) {
    throw new ListingTransitionError(from, to);
  }

  // 2. Is it a move a seller is allowed to make? (admin/worker moves → 403.)
  if (!SELLER_ACTIONS.has(action)) {
    throw new SellerActionError(action);
  }

  // 3. Entering review requires media. (422 otherwise.)
  if (to === "pending_review" && opts.photoCount < 1) {
    throw new PhotosRequiredError();
  }

  return action;
}
