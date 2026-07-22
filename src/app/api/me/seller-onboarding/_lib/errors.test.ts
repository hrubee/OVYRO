import { describe, expect, test } from "bun:test";
import { OnboardingTransitionError } from "@/lib/onboarding";
import { mapErrorToResponse } from "../../_lib/http";
import { AlreadyOnboardedError, OnboardingLockedError } from "./errors";

describe("onboarding errors map through the shared /api/me envelope", () => {
  test("AlreadyOnboardedError → 409 ALREADY_ONBOARDED", async () => {
    const res = mapErrorToResponse(new AlreadyOnboardedError());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "ALREADY_ONBOARDED" },
    });
  });

  test("OnboardingLockedError → 409 ONBOARDING_LOCKED", async () => {
    const res = mapErrorToResponse(new OnboardingLockedError());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "ONBOARDING_LOCKED" },
    });
  });

  test("an illegal state move → 409 INVALID_TRANSITION", async () => {
    const res = mapErrorToResponse(
      new OnboardingTransitionError("submitted", "submitted"),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
  });
});
