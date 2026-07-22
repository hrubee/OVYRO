import { describe, expect, test } from "bun:test";
import { sellerType } from "@/lib/db/schema";
import {
  onboardingAddressSchema,
  onboardingStepSchema,
  onboardingSubmitSchema,
} from "./schema";

const fullAddress = {
  line1: "12 MG Road",
  line2: "Near the lake",
  city: "Pune",
  region: "Maharashtra",
  postalCode: "411001",
  country: "IN",
};

const minimalSubmit = {
  sellerType: "individual",
  legalName: "Asha Rao",
  address: { line1: "12 MG Road", city: "Pune", country: "IN" },
  termsAccepted: true,
};

describe("onboardingStepSchema (spec §4.2.4)", () => {
  test("accepts an empty save (every field optional, resumable wizard)", () => {
    expect(onboardingStepSchema.parse({})).toEqual({});
  });

  test("accepts a single-field save and applies no defaults", () => {
    const parsed = onboardingStepSchema.parse({ sellerType: "broker" });
    expect(parsed.sellerType).toBe("broker");
    expect(parsed.legalName).toBeUndefined();
    expect(parsed.address).toBeUndefined();
    expect(parsed.termsAccepted).toBeUndefined();
    expect(parsed.step).toBeUndefined();
  });

  test("accepts a half-filled address", () => {
    const parsed = onboardingStepSchema.parse({ address: { line1: "12 MG Road" } });
    expect(parsed.address).toEqual({ line1: "12 MG Road" });
  });

  test("does not require termsAccepted to be true mid-wizard", () => {
    expect(onboardingStepSchema.parse({ termsAccepted: false }).termsAccepted).toBe(
      false,
    );
  });

  test("trims and normalizes what it is given", () => {
    const parsed = onboardingStepSchema.parse({
      legalName: "  Asha Rao  ",
      address: { line1: "12 MG Road", country: "in" },
    });
    expect(parsed.legalName).toBe("Asha Rao");
    expect(parsed.address?.country).toBe("IN");
  });

  test("strict: server-owned fields cannot be mass-assigned", () => {
    expect(() => onboardingStepSchema.parse({ state: "approved" })).toThrow();
    expect(() => onboardingStepSchema.parse({ userId: "u_hax" })).toThrow();
    expect(() => onboardingStepSchema.parse({ reviewedBy: "u_admin" })).toThrow();
    expect(() =>
      onboardingStepSchema.parse({ submittedAt: "2026-07-22T00:00:00Z" }),
    ).toThrow();
  });

  test("step must be a non-negative integer", () => {
    expect(onboardingStepSchema.parse({ step: 0 }).step).toBe(0);
    expect(() => onboardingStepSchema.parse({ step: -1 })).toThrow();
    expect(() => onboardingStepSchema.parse({ step: 1.5 })).toThrow();
  });
});

describe("onboardingSubmitSchema (spec §4.2.4)", () => {
  test("accepts a minimal complete application", () => {
    const parsed = onboardingSubmitSchema.parse(minimalSubmit);
    expect(parsed.sellerType).toBe("individual");
    expect(parsed.legalName).toBe("Asha Rao");
    expect(parsed.address.city).toBe("Pune");
    expect(parsed.idDocumentUrl).toBeUndefined();
  });

  test("accepts a full application with an ID document", () => {
    const parsed = onboardingSubmitSchema.parse({
      ...minimalSubmit,
      sellerType: "company",
      address: fullAddress,
      idDocumentUrl: "https://cdn.ovyro.example/id/doc-123.pdf",
    });
    expect(parsed.sellerType).toBe("company");
    expect(parsed.address.postalCode).toBe("411001");
    expect(parsed.idDocumentUrl).toBe("https://cdn.ovyro.example/id/doc-123.pdf");
  });

  test("termsAccepted must be present and explicitly true", () => {
    expect(() =>
      onboardingSubmitSchema.parse({ ...minimalSubmit, termsAccepted: false }),
    ).toThrow();
    const { termsAccepted: _omit, ...withoutTerms } = minimalSubmit;
    void _omit;
    expect(() => onboardingSubmitSchema.parse(withoutTerms)).toThrow();
  });

  test("sellerType, legalName and address are required", () => {
    const { sellerType: _st, ...noType } = minimalSubmit;
    void _st;
    expect(() => onboardingSubmitSchema.parse(noType)).toThrow();
    const { legalName: _ln, ...noName } = minimalSubmit;
    void _ln;
    expect(() => onboardingSubmitSchema.parse(noName)).toThrow();
    const { address: _addr, ...noAddress } = minimalSubmit;
    void _addr;
    expect(() => onboardingSubmitSchema.parse(noAddress)).toThrow();
  });

  test("address requires line1, city and country", () => {
    expect(() =>
      onboardingSubmitSchema.parse({
        ...minimalSubmit,
        address: { city: "Pune", country: "IN" },
      }),
    ).toThrow();
    expect(() =>
      onboardingSubmitSchema.parse({
        ...minimalSubmit,
        address: { line1: "12 MG Road", country: "IN" },
      }),
    ).toThrow();
    expect(() =>
      onboardingSubmitSchema.parse({
        ...minimalSubmit,
        address: { line1: "12 MG Road", city: "Pune" },
      }),
    ).toThrow();
  });

  test("country must be a 2-letter ISO code and is upper-cased", () => {
    const parsed = onboardingSubmitSchema.parse({
      ...minimalSubmit,
      address: { line1: "12 MG Road", city: "Pune", country: "in" },
    });
    expect(parsed.address.country).toBe("IN");
    expect(() =>
      onboardingSubmitSchema.parse({
        ...minimalSubmit,
        address: { line1: "12 MG Road", city: "Pune", country: "IND" },
      }),
    ).toThrow();
  });

  test("idDocumentUrl, when given, must be a valid URL", () => {
    expect(() =>
      onboardingSubmitSchema.parse({ ...minimalSubmit, idDocumentUrl: "not-a-url" }),
    ).toThrow();
  });

  test("reuses the DB seller_type enum (no drift)", () => {
    for (const value of sellerType.enumValues) {
      expect(
        onboardingSubmitSchema.parse({ ...minimalSubmit, sellerType: value })
          .sellerType,
      ).toBe(value);
    }
    expect(() =>
      onboardingSubmitSchema.parse({ ...minimalSubmit, sellerType: "reseller" }),
    ).toThrow();
  });

  test("strict: server-owned fields cannot be mass-assigned", () => {
    expect(() =>
      onboardingSubmitSchema.parse({ ...minimalSubmit, state: "approved" }),
    ).toThrow();
    expect(() =>
      onboardingSubmitSchema.parse({ ...minimalSubmit, userId: "u_hax" }),
    ).toThrow();
    expect(() =>
      onboardingSubmitSchema.parse({ ...minimalSubmit, reviewedBy: "u_admin" }),
    ).toThrow();
  });

  test("address is strict — stray keys into the jsonb blob are rejected", () => {
    expect(() =>
      onboardingAddressSchema.parse({ ...fullAddress, latitude: 18.5 }),
    ).toThrow();
  });
});
