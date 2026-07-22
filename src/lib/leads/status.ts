/**
 * Lead status state machine (spec §4.2.2).
 *
 * A lead moves `new → contacted → negotiating → won`, and may drop to `lost`
 * from any of those live stages. `won` and `lost` are terminal. This is the
 * single source of truth for legal moves: the seller lead inbox gates every
 * status change through `canTransition` / `assertTransition`, mirroring the
 * listings machine (`lib/listings/status.ts`).
 *
 * Deliberately dependency-free (no DB, no session) and the status *values* are
 * reused from the Drizzle `lead_status` pgEnum, so this module can never drift
 * from the column definition.
 */
import { leadStatus } from "@/lib/db/schema";

export const LEAD_STATUSES = leadStatus.enumValues;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * The named moves a seller makes on a lead. Unlike the listings machine, a
 * single action (`lose`) legitimately fires from several sources — a lead can
 * die at any live stage — so `from` is a list. Forward progress is strictly
 * one step at a time: no skipping straight to `won`, no reopening.
 */
export const LEAD_TRANSITIONS = {
  /** Seller reaches out to the buyer. */
  contact: { from: ["new"], to: "contacted" },
  /** Buyer and seller start negotiating terms. */
  negotiate: { from: ["contacted"], to: "negotiating" },
  /** Deal closed. */
  win: { from: ["negotiating"], to: "won" },
  /** Lead abandoned/unresponsive — reachable from any live stage. */
  lose: { from: ["new", "contacted", "negotiating"], to: "lost" },
} as const satisfies Record<
  string,
  { from: readonly LeadStatus[]; to: LeadStatus }
>;

export type LeadAction = keyof typeof LEAD_TRANSITIONS;

/** Adjacency derived from the named transitions — the single source of truth. */
const ALLOWED: Record<LeadStatus, ReadonlySet<LeadStatus>> = (() => {
  const map = {} as Record<LeadStatus, Set<LeadStatus>>;
  for (const status of LEAD_STATUSES) {
    map[status] = new Set<LeadStatus>();
  }
  for (const { from, to } of Object.values(LEAD_TRANSITIONS)) {
    for (const source of from) {
      map[source].add(to);
    }
  }
  return map;
})();

/** Thrown by `assertTransition` on an illegal status move. */
export class LeadTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  readonly status = 409;

  constructor(
    readonly from: LeadStatus,
    readonly to: LeadStatus,
  ) {
    super(`Cannot move a lead from "${from}" to "${to}".`);
    this.name = "LeadTransitionError";
  }
}

/** True when a lead may legally move from `from` to `to`. */
export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

/** Every status a lead in `from` may legally move to next. */
export function allowedTransitions(from: LeadStatus): LeadStatus[] {
  return [...(ALLOWED[from] ?? [])];
}

/** The action name for a legal move, or `null` if the move is illegal. */
export function transitionAction(
  from: LeadStatus,
  to: LeadStatus,
): LeadAction | null {
  for (const [action, edge] of Object.entries(LEAD_TRANSITIONS)) {
    if (edge.to === to && (edge.from as readonly LeadStatus[]).includes(from)) {
      return action as LeadAction;
    }
  }
  return null;
}

/** Throws `LeadTransitionError` unless the move is legal. */
export function assertTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransition(from, to)) {
    throw new LeadTransitionError(from, to);
  }
}

/** `won` and `lost` are terminal — no outgoing transitions. */
export function isTerminal(status: LeadStatus): boolean {
  return allowedTransitions(status).length === 0;
}
