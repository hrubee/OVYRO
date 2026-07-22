/**
 * Listing status state machine (spec §4.3.1, Figure 3).
 *
 * This is the single source of truth for how a listing may move between
 * statuses. The three wave-2 feature builders (seller CRUD, public browse,
 * admin moderation) all gate their mutations through `canTransition` /
 * `assertTransition`, so the legal moves live here and nowhere else.
 *
 * Deliberately dependency-free — no DB, no session — so it is trivial to unit
 * test and impossible to couple to a transport (mirrors `lib/auth/roles.ts`).
 *
 * The status *values* are reused from the Drizzle `listing_status` pgEnum so
 * this module can never drift from the column definition.
 */
import { listingStatus } from "@/lib/db/schema";

export const LISTING_STATUSES = listingStatus.enumValues;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * The named moves from Figure 3. Each action has exactly one legal source and
 * destination, so encoding them by name keeps the downstream builders honest:
 * a seller "pauses", an admin "approves", etc., rather than passing raw
 * from/to pairs and risking an illegal shortcut.
 */
export const LISTING_TRANSITIONS = {
  /** Seller submits a draft for moderation. */
  submit: { from: "draft", to: "pending_review" },
  /** Admin approves a pending listing — it goes public. */
  approve: { from: "pending_review", to: "active" },
  /** Admin rejects a pending listing. */
  reject: { from: "pending_review", to: "rejected" },
  /** Seller pauses an active listing (hidden, not deleted). */
  pause: { from: "active", to: "paused" },
  /** Seller reactivates a paused listing. */
  reactivate: { from: "paused", to: "active" },
  /** Seller marks an active listing as sold. */
  mark_sold: { from: "active", to: "sold" },
  /** Worker expires an active listing after 90 days idle. */
  expire: { from: "active", to: "expired" },
  /** Seller renews an expired listing (edit & resubmit for review). */
  renew: { from: "expired", to: "pending_review" },
  /** Seller edits & resubmits a rejected listing for review. */
  resubmit: { from: "rejected", to: "pending_review" },
} as const satisfies Record<string, { from: ListingStatus; to: ListingStatus }>;

export type ListingAction = keyof typeof LISTING_TRANSITIONS;

/** Adjacency derived from the named transitions — the single source of truth. */
const ALLOWED: Record<ListingStatus, ReadonlySet<ListingStatus>> = (() => {
  const map = {} as Record<ListingStatus, Set<ListingStatus>>;
  for (const status of LISTING_STATUSES) {
    map[status] = new Set<ListingStatus>();
  }
  for (const { from, to } of Object.values(LISTING_TRANSITIONS)) {
    map[from].add(to);
  }
  return map;
})();

/** Thrown by `assertTransition` on an illegal status move. */
export class ListingTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  readonly status = 409;

  constructor(
    readonly from: ListingStatus,
    readonly to: ListingStatus,
  ) {
    super(`Cannot move a listing from "${from}" to "${to}".`);
    this.name = "ListingTransitionError";
  }
}

/** True when a listing may legally move from `from` to `to`. */
export function canTransition(from: ListingStatus, to: ListingStatus): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

/** Every status a listing in `from` may legally move to next. */
export function allowedTransitions(from: ListingStatus): ListingStatus[] {
  return [...(ALLOWED[from] ?? [])];
}

/** The action name for a legal move, or `null` if the move is illegal. */
export function transitionAction(
  from: ListingStatus,
  to: ListingStatus,
): ListingAction | null {
  for (const [action, edge] of Object.entries(LISTING_TRANSITIONS)) {
    if (edge.from === from && edge.to === to) return action as ListingAction;
  }
  return null;
}

/** Throws `ListingTransitionError` unless the move is legal. */
export function assertTransition(from: ListingStatus, to: ListingStatus): void {
  if (!canTransition(from, to)) {
    throw new ListingTransitionError(from, to);
  }
}

/** A sold listing is terminal — no outgoing transitions. */
export function isTerminal(status: ListingStatus): boolean {
  return allowedTransitions(status).length === 0;
}

/** Statuses that render on public, unauthenticated surfaces (spec §4.3.1). */
export function isPubliclyVisible(status: ListingStatus): boolean {
  return status === "active";
}
