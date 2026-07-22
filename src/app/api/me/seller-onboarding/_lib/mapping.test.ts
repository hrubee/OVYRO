import { describe, expect, test } from "bun:test";
import type { OnboardingStepInput, OnboardingSubmitInput } from "@/lib/onboarding";
import { buildStepPatch, buildSubmitValues } from "./mapping";

const NOW = new Date("2026-07-22T12:00:00.000Z");

describe("buildStepPatch", () => {
  test("an absent field is omitted so the stored value is left untouched", () => {
    const input: OnboardingStepInput = { legalName: "Ada Lovelace" };
    const patch = buildStepPatch(input, null, NOW);

    expect(patch).toEqual({ legalName: "Ada Lovelace" });
    // No `sellerType`, `step`, `addressJson`, etc. — nothing to reset.
    expect("sellerType" in patch).toBe(false);
    expect("addressJson" in patch).toBe(false);
    expect("termsAcceptedAt" in patch).toBe(false);
  });

  test("carries the scalar wizard fields straight through", () => {
    const input: OnboardingStepInput = {
      step: 2,
      sellerType: "broker",
      legalName: "Ada",
      idDocumentUrl: "https://cdn.example.com/id.pdf",
    };
    expect(buildStepPatch(input, null, NOW)).toEqual({
      step: 2,
      sellerType: "broker",
      legalName: "Ada",
      idDocumentUrl: "https://cdn.example.com/id.pdf",
    });
  });

  test("merges a partial address onto the stored one (never wipes siblings)", () => {
    const existing = {
      addressJson: { line1: "1 Main St", city: "Pune", country: "IN" },
      termsAcceptedAt: null,
    };
    const input: OnboardingStepInput = { address: { city: "Mumbai", postalCode: "400001" } };

    const patch = buildStepPatch(input, existing, NOW);

    expect(patch.addressJson).toEqual({
      line1: "1 Main St",
      city: "Mumbai",
      postalCode: "400001",
      country: "IN",
    });
  });

  test("address on a fresh row starts from an empty object", () => {
    const input: OnboardingStepInput = { address: { line1: "1 Main St", city: "Pune", country: "IN" } };
    const patch = buildStepPatch(input, null, NOW);
    expect(patch.addressJson).toEqual({ line1: "1 Main St", city: "Pune", country: "IN" });
  });

  test("termsAccepted:true stamps now when not yet accepted", () => {
    const patch = buildStepPatch({ termsAccepted: true }, null, NOW);
    expect(patch.termsAcceptedAt).toBe(NOW);
  });

  test("termsAccepted:true keeps the original acceptance instant", () => {
    const earlier = new Date("2026-07-01T00:00:00.000Z");
    const patch = buildStepPatch(
      { termsAccepted: true },
      { addressJson: null, termsAcceptedAt: earlier },
      NOW,
    );
    expect(patch.termsAcceptedAt).toBe(earlier);
  });

  test("termsAccepted:false clears the acceptance", () => {
    const patch = buildStepPatch(
      { termsAccepted: false },
      { addressJson: null, termsAcceptedAt: new Date() },
      NOW,
    );
    expect(patch.termsAcceptedAt).toBeNull();
  });

  test("an empty step save is a no-op patch", () => {
    expect(buildStepPatch({}, null, NOW)).toEqual({});
  });
});

describe("buildSubmitValues", () => {
  const submit: OnboardingSubmitInput = {
    sellerType: "company",
    legalName: "Ovyro Holdings",
    address: { line1: "1 Main St", city: "Pune", country: "IN" },
    idDocumentUrl: "https://cdn.example.com/id.pdf",
    termsAccepted: true,
  };

  test("writes the full application, transitions to submitted, stamps timestamps", () => {
    const values = buildSubmitValues(submit, NOW);
    expect(values).toEqual({
      sellerType: "company",
      legalName: "Ovyro Holdings",
      addressJson: { line1: "1 Main St", city: "Pune", country: "IN" },
      idDocumentUrl: "https://cdn.example.com/id.pdf",
      termsAcceptedAt: NOW,
      state: "submitted",
      submittedAt: NOW,
      reviewNote: null,
      reviewedBy: null,
    });
  });

  test("clears prior review metadata so a resubmit reaches the admin clean", () => {
    const values = buildSubmitValues(submit, NOW);
    expect(values.reviewNote).toBeNull();
    expect(values.reviewedBy).toBeNull();
  });

  test("the optional ID document passes through as undefined when omitted", () => {
    const withoutId: OnboardingSubmitInput = {
      sellerType: "company",
      legalName: "Ovyro Holdings",
      address: { line1: "1 Main St", city: "Pune", country: "IN" },
      termsAccepted: true,
    };
    const values = buildSubmitValues(withoutId, NOW);
    expect(values.idDocumentUrl).toBeUndefined();
  });
});
