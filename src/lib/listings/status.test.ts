import { describe, expect, test } from "bun:test";
import {
  LISTING_STATUSES,
  LISTING_TRANSITIONS,
  ListingTransitionError,
  allowedTransitions,
  assertTransition,
  canTransition,
  isPubliclyVisible,
  isTerminal,
  transitionAction,
  type ListingStatus,
} from "./status";

/** The full legal edge set from spec §4.3.1 Figure 3, kept independent of the
 * implementation so the test would catch a table edit that adds/drops an edge. */
const LEGAL: ReadonlyArray<[ListingStatus, ListingStatus]> = [
  ["draft", "pending_review"],
  ["pending_review", "active"],
  ["pending_review", "rejected"],
  ["active", "paused"],
  ["active", "sold"],
  ["active", "expired"],
  ["paused", "active"],
  ["expired", "pending_review"],
  ["rejected", "pending_review"],
];

const legalKey = (from: ListingStatus, to: ListingStatus) => `${from}->${to}`;
const LEGAL_SET = new Set(LEGAL.map(([f, t]) => legalKey(f, t)));

describe("listing status machine (spec §4.3.1)", () => {
  test("reuses the DB pgEnum values verbatim (no drift)", () => {
    expect([...LISTING_STATUSES].sort()).toEqual(
      ["active", "draft", "expired", "paused", "pending_review", "rejected", "sold"],
    );
  });

  test("canTransition is true for exactly the legal edges and false everywhere else", () => {
    for (const from of LISTING_STATUSES) {
      for (const to of LISTING_STATUSES) {
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
    const illegal: Array<[ListingStatus, ListingStatus]> = [
      ["draft", "active"], // cannot skip review
      ["draft", "sold"],
      ["active", "draft"], // no going back to draft
      ["pending_review", "paused"],
      ["paused", "sold"], // must reactivate first
      ["rejected", "active"], // must be re-reviewed
      ["expired", "active"], // must be re-reviewed
      ["active", "active"], // no self-loop
    ];
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(ListingTransitionError);
    }
  });

  test("sold is terminal; no status may leave it", () => {
    expect(isTerminal("sold")).toBe(true);
    expect(allowedTransitions("sold")).toEqual([]);
    for (const to of LISTING_STATUSES) {
      expect(canTransition("sold", to)).toBe(false);
    }
  });

  test("allowedTransitions lists the reachable next statuses", () => {
    expect([...allowedTransitions("active")].sort()).toEqual([
      "expired",
      "paused",
      "sold",
    ]);
    expect(allowedTransitions("draft")).toEqual(["pending_review"]);
  });
});

describe("named transitions", () => {
  test("every named action encodes a legal edge", () => {
    for (const { from, to } of Object.values(LISTING_TRANSITIONS)) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  test("transitionAction round-trips legal edges and returns null for illegal", () => {
    expect(transitionAction("draft", "pending_review")).toBe("submit");
    expect(transitionAction("pending_review", "active")).toBe("approve");
    expect(transitionAction("active", "sold")).toBe("mark_sold");
    expect(transitionAction("paused", "active")).toBe("reactivate");
    expect(transitionAction("draft", "active")).toBeNull();
  });
});

describe("ListingTransitionError", () => {
  test("carries the API error envelope and the from/to context", () => {
    try {
      assertTransition("sold", "active");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ListingTransitionError);
      const err = error as ListingTransitionError;
      expect(err.code).toBe("INVALID_TRANSITION");
      expect(err.status).toBe(409);
      expect(err.from).toBe("sold");
      expect(err.to).toBe("active");
    }
  });
});

describe("public visibility", () => {
  test("only active listings are publicly visible", () => {
    for (const status of LISTING_STATUSES) {
      expect(isPubliclyVisible(status)).toBe(status === "active");
    }
  });
});
