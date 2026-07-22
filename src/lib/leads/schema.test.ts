import { describe, expect, test } from "bun:test";
import { preferredContact } from "@/lib/db/schema";
import { inquirySchema } from "./schema";

const minimal = {
  contactName: "Asha Rao",
  contactPhone: "+919876543210",
  consent: true,
};

describe("inquirySchema (spec §4.2.2)", () => {
  test("accepts a minimal inquiry and defaults preferredContact to phone", () => {
    const parsed = inquirySchema.parse(minimal);
    expect(parsed.contactName).toBe("Asha Rao");
    expect(parsed.preferredContact).toBe("phone");
    expect(parsed.offerAmount).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  test("accepts a full negotiation payload", () => {
    const parsed = inquirySchema.parse({
      ...minimal,
      offerAmount: 2_400_000,
      message: "  Interested — can you share the survey doc?  ",
      contactEmail: "Asha@Example.com",
      preferredContact: "whatsapp",
    });
    expect(parsed.offerAmount).toBe(2_400_000);
    expect(parsed.message).toBe("Interested — can you share the survey doc?");
    expect(parsed.contactEmail).toBe("asha@example.com");
    expect(parsed.preferredContact).toBe("whatsapp");
  });

  test("consent must be present and explicitly true", () => {
    expect(() => inquirySchema.parse({ ...minimal, consent: false })).toThrow();
    expect(() =>
      inquirySchema.parse({
        contactName: minimal.contactName,
        contactPhone: minimal.contactPhone,
      }),
    ).toThrow();
  });

  test("contactName and contactPhone are required", () => {
    expect(() =>
      inquirySchema.parse({
        contactPhone: minimal.contactPhone,
        consent: minimal.consent,
      }),
    ).toThrow();
    expect(() =>
      inquirySchema.parse({
        contactName: minimal.contactName,
        consent: minimal.consent,
      }),
    ).toThrow();
    expect(() =>
      inquirySchema.parse({ ...minimal, contactPhone: "not-a-phone" }),
    ).toThrow();
  });

  test("offerAmount must be positive and within column precision", () => {
    expect(() => inquirySchema.parse({ ...minimal, offerAmount: 0 })).toThrow();
    expect(() => inquirySchema.parse({ ...minimal, offerAmount: -1 })).toThrow();
    expect(() =>
      inquirySchema.parse({ ...minimal, offerAmount: 1_000_000_000_000 }),
    ).toThrow();
  });

  test("contactEmail, when given, must be a valid address", () => {
    expect(() =>
      inquirySchema.parse({ ...minimal, contactEmail: "not-an-email" }),
    ).toThrow();
  });

  test("reuses the DB preferred_contact enum (no drift)", () => {
    for (const value of preferredContact.enumValues) {
      expect(
        inquirySchema.parse({ ...minimal, preferredContact: value })
          .preferredContact,
      ).toBe(value);
    }
    expect(() =>
      inquirySchema.parse({ ...minimal, preferredContact: "carrier-pigeon" }),
    ).toThrow();
  });

  test("strict: server-owned fields cannot be mass-assigned", () => {
    expect(() =>
      inquirySchema.parse({ ...minimal, status: "won" }),
    ).toThrow();
    expect(() =>
      inquirySchema.parse({ ...minimal, buyerId: "u_hax", sellerId: "u_hax" }),
    ).toThrow();
    expect(() =>
      inquirySchema.parse({ ...minimal, metaEventId: "evt_forged" }),
    ).toThrow();
  });
});
