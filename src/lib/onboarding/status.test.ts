import { describe, expect, test } from "bun:test";
import {
  ONBOARDING_STATES,
  ONBOARDING_TRANSITIONS,
  OnboardingTransitionError,
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminal,
  transitionAction,
  type OnboardingState,
} from "./status";

/** The full legal edge set from spec §4.2.4, kept independent of the
 * implementation so the test catches a table edit that adds/drops an edge. */
const LEGAL: ReadonlyArray<[OnboardingState, OnboardingState]> = [
  ["in_progress", "submitted"],
  ["submitted", "approved"],
  ["submitted", "rejected"],
  ["rejected", "in_progress"],
];

const legalKey = (from: OnboardingState, to: OnboardingState) => `${from}->${to}`;
const LEGAL_SET = new Set(LEGAL.map(([f, t]) => legalKey(f, t)));

describe("seller onboarding state machine (spec §4.2.4)", () => {
  test("reuses the DB pgEnum values verbatim (no drift)", () => {
    expect([...ONBOARDING_STATES].sort()).toEqual([
      "approved",
      "in_progress",
      "rejected",
      "submitted",
    ]);
  });

  test("canTransition is true for exactly the legal edges and false everywhere else", () => {
    for (const from of ONBOARDING_STATES) {
      for (const to of ONBOARDING_STATES) {
        expect(canTransition(from, to)).toBe(LEGAL_SET.has(legalKey(from, to)));
      }
    }
  });

  test("every legal move is accepted by assertTransition", () => {
    for (const [from, to] of LEGAL) {
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  test("illegal moves are rejected by assertTransition", () => {
    const illegal: Array<[OnboardingState, OnboardingState]> = [
      ["in_progress", "approved"], // cannot skip review
      ["in_progress", "rejected"], // cannot skip review
      ["in_progress", "in_progress"], // no self-loop
      ["submitted", "in_progress"], // no going back without a decision
      ["submitted", "submitted"], // no self-loop
      ["rejected", "submitted"], // must reopen (edit) before resubmitting
      ["rejected", "approved"], // cannot approve a rejected application
      ["rejected", "rejected"], // no self-loop
      ["approved", "in_progress"], // terminal, no reopening
      ["approved", "submitted"], // terminal
      ["approved", "rejected"], // terminal
      ["approved", "approved"], // terminal
    ];
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(OnboardingTransitionError);
    }
  });

  test("approved is terminal; no state may leave it", () => {
    expect(isTerminal("approved")).toBe(true);
    expect(allowedTransitions("approved")).toEqual([]);
    for (const to of ONBOARDING_STATES) {
      expect(canTransition("approved", to)).toBe(false);
    }
  });

  test("in_progress, submitted and rejected are not terminal", () => {
    for (const state of ["in_progress", "submitted", "rejected"] as const) {
      expect(isTerminal(state)).toBe(false);
    }
  });

  test("allowedTransitions lists the reachable next states", () => {
    expect(allowedTransitions("in_progress")).toEqual(["submitted"]);
    expect([...allowedTransitions("submitted")].sort()).toEqual([
      "approved",
      "rejected",
    ]);
    expect(allowedTransitions("rejected")).toEqual(["in_progress"]);
  });
});

describe("named transitions", () => {
  test("every named action encodes only legal edges", () => {
    for (const { from, to } of Object.values(ONBOARDING_TRANSITIONS)) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  test("transitionAction round-trips legal edges and returns null for illegal", () => {
    expect(transitionAction("in_progress", "submitted")).toBe("submit");
    expect(transitionAction("submitted", "approved")).toBe("approve");
    expect(transitionAction("submitted", "rejected")).toBe("reject");
    expect(transitionAction("rejected", "in_progress")).toBe("resubmit");
    expect(transitionAction("in_progress", "approved")).toBeNull();
    expect(transitionAction("approved", "in_progress")).toBeNull();
  });
});

describe("OnboardingTransitionError", () => {
  test("carries the API error envelope and the from/to context", () => {
    try {
      assertTransition("approved", "in_progress");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OnboardingTransitionError);
      const err = error as OnboardingTransitionError;
      expect(err.code).toBe("INVALID_TRANSITION");
      expect(err.status).toBe(409);
      expect(err.from).toBe("approved");
      expect(err.to).toBe("in_progress");
    }
  });
});
