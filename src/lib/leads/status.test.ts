import { describe, expect, test } from "bun:test";
import {
  LEAD_STATUSES,
  LEAD_TRANSITIONS,
  LeadTransitionError,
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminal,
  transitionAction,
  type LeadStatus,
} from "./status";

/** The full legal edge set from spec §4.2.2, kept independent of the
 * implementation so the test catches a table edit that adds/drops an edge. */
const LEGAL: ReadonlyArray<[LeadStatus, LeadStatus]> = [
  ["new", "contacted"],
  ["new", "lost"],
  ["contacted", "negotiating"],
  ["contacted", "lost"],
  ["negotiating", "won"],
  ["negotiating", "lost"],
];

const legalKey = (from: LeadStatus, to: LeadStatus) => `${from}->${to}`;
const LEGAL_SET = new Set(LEGAL.map(([f, t]) => legalKey(f, t)));

describe("lead status machine (spec §4.2.2)", () => {
  test("reuses the DB pgEnum values verbatim (no drift)", () => {
    expect([...LEAD_STATUSES].sort()).toEqual([
      "contacted",
      "lost",
      "negotiating",
      "new",
      "won",
    ]);
  });

  test("canTransition is true for exactly the legal edges and false everywhere else", () => {
    for (const from of LEAD_STATUSES) {
      for (const to of LEAD_STATUSES) {
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
    const illegal: Array<[LeadStatus, LeadStatus]> = [
      ["new", "negotiating"], // cannot skip contacting
      ["new", "won"], // cannot skip straight to a close
      ["contacted", "won"], // must negotiate first
      ["contacted", "new"], // no going back
      ["negotiating", "contacted"], // no going back
      ["won", "lost"], // terminal
      ["won", "negotiating"], // terminal
      ["lost", "new"], // terminal, no reopening
      ["lost", "contacted"], // terminal
      ["new", "new"], // no self-loop
    ];
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(LeadTransitionError);
    }
  });

  test("won and lost are terminal; no status may leave them", () => {
    for (const terminal of ["won", "lost"] as const) {
      expect(isTerminal(terminal)).toBe(true);
      expect(allowedTransitions(terminal)).toEqual([]);
      for (const to of LEAD_STATUSES) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  test("live stages are not terminal", () => {
    for (const status of ["new", "contacted", "negotiating"] as const) {
      expect(isTerminal(status)).toBe(false);
    }
  });

  test("allowedTransitions lists the reachable next statuses", () => {
    expect([...allowedTransitions("new")].sort()).toEqual(["contacted", "lost"]);
    expect([...allowedTransitions("contacted")].sort()).toEqual([
      "lost",
      "negotiating",
    ]);
    expect([...allowedTransitions("negotiating")].sort()).toEqual(["lost", "won"]);
  });
});

describe("named transitions", () => {
  test("every named action encodes only legal edges", () => {
    for (const { from, to } of Object.values(LEAD_TRANSITIONS)) {
      for (const source of from) {
        expect(canTransition(source, to)).toBe(true);
      }
    }
  });

  test("transitionAction round-trips legal edges and returns null for illegal", () => {
    expect(transitionAction("new", "contacted")).toBe("contact");
    expect(transitionAction("contacted", "negotiating")).toBe("negotiate");
    expect(transitionAction("negotiating", "won")).toBe("win");
    expect(transitionAction("new", "lost")).toBe("lose");
    expect(transitionAction("contacted", "lost")).toBe("lose");
    expect(transitionAction("negotiating", "lost")).toBe("lose");
    expect(transitionAction("new", "won")).toBeNull();
  });
});

describe("LeadTransitionError", () => {
  test("carries the API error envelope and the from/to context", () => {
    try {
      assertTransition("won", "negotiating");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(LeadTransitionError);
      const err = error as LeadTransitionError;
      expect(err.code).toBe("INVALID_TRANSITION");
      expect(err.status).toBe(409);
      expect(err.from).toBe("won");
      expect(err.to).toBe("negotiating");
    }
  });
});
