import { describe, expect, test } from "bun:test";
import {
  LOGIN_BLOCKED_STATUSES,
  SUSPENDED_SIGN_IN_CODE,
  SUSPENDED_SIGN_IN_MESSAGE,
  isLoginBlocked,
} from "./suspension";

describe("isLoginBlocked", () => {
  test("an active account can sign in", () => {
    expect(isLoginBlocked("active")).toBe(false);
  });

  test("a suspended account is blocked at sign-in (spec §14)", () => {
    expect(isLoginBlocked("suspended")).toBe(true);
  });

  test("a soft-deleted account is blocked at sign-in", () => {
    expect(isLoginBlocked("deleted")).toBe(true);
  });

  test("null / undefined / unknown statuses are treated as allowed", () => {
    // A missing row should not itself block sign-in — the DB lookup, not this
    // predicate, decides whether a user exists.
    expect(isLoginBlocked(null)).toBe(false);
    expect(isLoginBlocked(undefined)).toBe(false);
    expect(isLoginBlocked("banana")).toBe(false);
  });

  test("every blocked status is a non-active status", () => {
    for (const status of LOGIN_BLOCKED_STATUSES) {
      expect(status).not.toBe("active");
      expect(isLoginBlocked(status)).toBe(true);
    }
  });

  test("exposes a stable client-facing code and message", () => {
    expect(SUSPENDED_SIGN_IN_CODE).toBe("ACCOUNT_SUSPENDED");
    expect(SUSPENDED_SIGN_IN_MESSAGE.length).toBeGreaterThan(0);
  });
});
