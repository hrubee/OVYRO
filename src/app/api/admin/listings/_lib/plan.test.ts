import { describe, expect, test } from "bun:test";
import { ListingTransitionError, type ListingStatus } from "@/lib/listings";
import {
  EXPIRY_DAYS,
  computeExpiresAt,
  moderationSnapshot,
  planApproval,
  planRejection,
} from "./plan";

describe("planApproval", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  test("publishes and sets a 90-day expiry from a pending listing", () => {
    const patch = planApproval("pending_review", now);
    expect(patch.status).toBe("active");
    expect(patch.publishedAt).toEqual(now);
    expect(patch.expiresAt).toEqual(computeExpiresAt(now));
  });

  test("expiry is exactly EXPIRY_DAYS ahead", () => {
    const patch = planApproval("pending_review", now);
    const days = (patch.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(EXPIRY_DAYS);
    expect(EXPIRY_DAYS).toBe(90);
  });

  test("rejects approving a listing that is not pending review", () => {
    const illegal: ListingStatus[] = ["draft", "active", "paused", "sold", "rejected", "expired"];
    for (const status of illegal) {
      expect(() => planApproval(status, now)).toThrow(ListingTransitionError);
    }
  });
});

describe("planRejection", () => {
  test("moves a pending listing to rejected with the reason", () => {
    const patch = planRejection("pending_review", "Ownership documents unclear.");
    expect(patch).toEqual({ status: "rejected", rejectedReason: "Ownership documents unclear." });
  });

  test("rejects rejecting a listing that is not pending review", () => {
    const illegal: ListingStatus[] = ["draft", "active", "paused", "sold", "rejected", "expired"];
    for (const status of illegal) {
      expect(() => planRejection(status, "nope")).toThrow(ListingTransitionError);
    }
  });
});

describe("moderationSnapshot", () => {
  test("serializes moderation fields, ISO-encoding timestamps", () => {
    const snapshot = moderationSnapshot({
      status: "active",
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-04-01T00:00:00.000Z"),
      rejectedReason: null,
    });
    expect(snapshot).toEqual({
      status: "active",
      publishedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-04-01T00:00:00.000Z",
      rejectedReason: null,
    });
  });

  test("null timestamps stay null", () => {
    const snapshot = moderationSnapshot({
      status: "pending_review",
      publishedAt: null,
      expiresAt: null,
      rejectedReason: null,
    });
    expect(snapshot.publishedAt).toBeNull();
    expect(snapshot.expiresAt).toBeNull();
  });
});
