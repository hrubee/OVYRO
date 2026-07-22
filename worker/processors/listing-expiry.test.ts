import { describe, expect, test } from "bun:test";
import type { ListingStatus } from "@/lib/listings";
import { isOverdue } from "./listing-expiry";

const now = new Date("2026-07-22T00:00:00.000Z");
const yesterday = new Date("2026-07-21T00:00:00.000Z");
const tomorrow = new Date("2026-07-23T00:00:00.000Z");

describe("isOverdue", () => {
  test("active + expiry in the past is overdue", () => {
    expect(isOverdue({ status: "active", expiresAt: yesterday }, now)).toBe(true);
  });

  test("expiry exactly now counts as overdue (inclusive)", () => {
    expect(isOverdue({ status: "active", expiresAt: now }, now)).toBe(true);
  });

  test("active + expiry in the future is not overdue", () => {
    expect(isOverdue({ status: "active", expiresAt: tomorrow }, now)).toBe(false);
  });

  test("active with no expiry is never overdue", () => {
    expect(isOverdue({ status: "active", expiresAt: null }, now)).toBe(false);
  });

  test("only active listings can be overdue", () => {
    const nonActive: ListingStatus[] = [
      "draft",
      "pending_review",
      "paused",
      "sold",
      "rejected",
      "expired",
    ];
    for (const status of nonActive) {
      expect(isOverdue({ status, expiresAt: yesterday }, now)).toBe(false);
    }
  });
});
