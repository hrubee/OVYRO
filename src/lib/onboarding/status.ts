/**
 * Seller onboarding state machine (spec §4.2.4).
 *
 * A buyer's seller application moves `in_progress → submitted`, then an admin
 * moves it `submitted → approved | rejected`; a rejected application can be
 * edited and reopened (`rejected → in_progress`) for another pass. Approval is
 * what grants the additive `seller` role — the state here is the application
 * record, not the permission (spec §4.2.4, §6 `seller_onboarding`).
 *
 * This is the single source of truth for legal moves: the buyer onboarding
 * flow and the admin review surface both gate every state change through
 * `canTransition` / `assertTransition`, mirroring the listings and leads
 * machines (`lib/listings/status.ts`, `lib/leads/status.ts`).
 *
 * Deliberately dependency-free (no DB, no session) and the state *values* are
 * reused from the Drizzle `seller_onboarding_state` pgEnum, so this module can
 * never drift from the column definition.
 */
import { sellerOnboardingState } from "@/lib/db/schema";

export const ONBOARDING_STATES = sellerOnboardingState.enumValues;

export type OnboardingState = (typeof ONBOARDING_STATES)[number];

/**
 * The named moves from spec §4.2.4. Each action has exactly one legal source
 * and destination (like the listings machine, unlike the multi-source leads
 * machine), so encoding them by name keeps the downstream builders honest: a
 * buyer "submits", an admin "approves", etc., rather than passing raw from/to
 * pairs and risking an illegal shortcut.
 */
export const ONBOARDING_TRANSITIONS = {
  /** Buyer submits their completed application for review. */
  submit: { from: "in_progress", to: "submitted" },
  /** Admin approves — the additive `seller` role is granted downstream. */
  approve: { from: "submitted", to: "approved" },
  /** Admin rejects the application with a review note. */
  reject: { from: "submitted", to: "rejected" },
  /** Buyer edits a rejected application, reopening it for another pass. */
  resubmit: { from: "rejected", to: "in_progress" },
} as const satisfies Record<
  string,
  { from: OnboardingState; to: OnboardingState }
>;

export type OnboardingAction = keyof typeof ONBOARDING_TRANSITIONS;

/** Adjacency derived from the named transitions — the single source of truth. */
const ALLOWED: Record<OnboardingState, ReadonlySet<OnboardingState>> = (() => {
  const map = {} as Record<OnboardingState, Set<OnboardingState>>;
  for (const state of ONBOARDING_STATES) {
    map[state] = new Set<OnboardingState>();
  }
  for (const { from, to } of Object.values(ONBOARDING_TRANSITIONS)) {
    map[from].add(to);
  }
  return map;
})();

/** Thrown by `assertTransition` on an illegal state move. */
export class OnboardingTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  readonly status = 409;

  constructor(
    readonly from: OnboardingState,
    readonly to: OnboardingState,
  ) {
    super(`Cannot move a seller application from "${from}" to "${to}".`);
    this.name = "OnboardingTransitionError";
  }
}

/** True when an application may legally move from `from` to `to`. */
export function canTransition(
  from: OnboardingState,
  to: OnboardingState,
): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

/** Every state an application in `from` may legally move to next. */
export function allowedTransitions(from: OnboardingState): OnboardingState[] {
  return [...(ALLOWED[from] ?? [])];
}

/** The action name for a legal move, or `null` if the move is illegal. */
export function transitionAction(
  from: OnboardingState,
  to: OnboardingState,
): OnboardingAction | null {
  for (const [action, edge] of Object.entries(ONBOARDING_TRANSITIONS)) {
    if (edge.from === from && edge.to === to) return action as OnboardingAction;
  }
  return null;
}

/** Throws `OnboardingTransitionError` unless the move is legal. */
export function assertTransition(
  from: OnboardingState,
  to: OnboardingState,
): void {
  if (!canTransition(from, to)) {
    throw new OnboardingTransitionError(from, to);
  }
}

/** `approved` is terminal — no outgoing transitions. */
export function isTerminal(state: OnboardingState): boolean {
  return allowedTransitions(state).length === 0;
}
