/**
 * Derives the status-pipeline actions available on a lead from the shared
 * leads-core state machine (task OVYRO-9e62), so the inbox buttons can never
 * offer an illegal move. This is the UI mirror of the server's `assertTransition`
 * guard — both draw from `LEAD_TRANSITIONS` (the single source of truth); the
 * server enforces, this presents.
 *
 * Unlike the listings machine there is no admin/worker split: every lead
 * transition is a seller move, so `allowedTransitions` is offered as-is.
 */
import {
  allowedTransitions,
  transitionAction,
  type LeadAction,
  type LeadStatus,
} from "@/lib/leads";

export interface LeadActionOption {
  action: LeadAction;
  /** The status this action moves the lead to. */
  to: LeadStatus;
  label: string;
}

const ACTION_LABELS: Record<LeadAction, string> = {
  contact: "Mark contacted",
  negotiate: "Move to negotiating",
  win: "Mark won",
  lose: "Mark lost",
};

/** Pipeline moves a seller may make on a lead currently in `status`. */
export function leadActionsFor(status: LeadStatus): LeadActionOption[] {
  return allowedTransitions(status)
    .map((to): LeadActionOption | null => {
      const action = transitionAction(status, to);
      if (action === null) return null;
      return { action, to, label: ACTION_LABELS[action] };
    })
    .filter((option): option is LeadActionOption => option !== null);
}
