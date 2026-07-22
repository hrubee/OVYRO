import { describe, expect, test } from "bun:test";
import {
  OnboardingTransitionError,
  type OnboardingState,
} from "@/lib/onboarding";
import { planApproval, planRejection, reviewSnapshot } from "./plan";

const ADMIN = "usr_admin";

describe("planApproval", () => {
  test("moves a submitted application to approved, recording the reviewer", () => {
    expect(planApproval("submitted", ADMIN)).toEqual({
      state: "approved",
      reviewedBy: ADMIN,
    });
  });

  test("rejects approving an application that is not submitted", () => {
    const illegal: OnboardingState[] = ["in_progress", "approved", "rejected"];
    for (const state of illegal) {
      expect(() => planApproval(state, ADMIN)).toThrow(OnboardingTransitionError);
    }
  });
});

describe("planRejection", () => {
  test("moves a submitted application to rejected with the reviewer + note", () => {
    expect(planRejection("submitted", ADMIN, "ID document unreadable.")).toEqual({
      state: "rejected",
      reviewedBy: ADMIN,
      reviewNote: "ID document unreadable.",
    });
  });

  test("rejects rejecting an application that is not submitted", () => {
    const illegal: OnboardingState[] = ["in_progress", "approved", "rejected"];
    for (const state of illegal) {
      expect(() => planRejection(state, ADMIN, "nope")).toThrow(
        OnboardingTransitionError,
      );
    }
  });
});

describe("reviewSnapshot", () => {
  test("serializes review fields, ISO-encoding submittedAt", () => {
    const snapshot = reviewSnapshot({
      state: "approved",
      reviewedBy: ADMIN,
      reviewNote: null,
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(snapshot).toEqual({
      state: "approved",
      reviewedBy: ADMIN,
      reviewNote: null,
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("null submittedAt stays null", () => {
    const snapshot = reviewSnapshot({
      state: "submitted",
      reviewedBy: null,
      reviewNote: null,
      submittedAt: null,
    });
    expect(snapshot.submittedAt).toBeNull();
    expect(snapshot.reviewedBy).toBeNull();
  });
});
