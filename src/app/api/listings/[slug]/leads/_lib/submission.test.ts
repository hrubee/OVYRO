import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { CAPTCHA_FIELD, HONEYPOT_FIELD, parseSubmission } from "./submission";
import { SpamRejectedError } from "./http";

const validBody = () => ({
  contactName: "Ravi Kumar",
  contactPhone: "+919876543210",
  contactEmail: "ravi@example.com",
  offerAmount: 1_200_000,
  message: "Interested — is the survey number clear?",
  preferredContact: "whatsapp",
  consent: true,
  [CAPTCHA_FIELD]: "turnstile-token",
  [HONEYPOT_FIELD]: "",
});

describe("parseSubmission", () => {
  test("splits captcha token from the validated inquiry fields", () => {
    const { inquiry, captchaToken } = parseSubmission(validBody());
    expect(captchaToken).toBe("turnstile-token");
    expect(inquiry.contactName).toBe("Ravi Kumar");
    expect(inquiry.offerAmount).toBe(1_200_000);
    expect(inquiry.preferredContact).toBe("whatsapp");
    expect(inquiry.consent).toBe(true);
    // Envelope-only fields never leak into the inquiry object.
    expect(inquiry).not.toHaveProperty(CAPTCHA_FIELD);
    expect(inquiry).not.toHaveProperty(HONEYPOT_FIELD);
  });

  test("defaults captcha token to empty when absent", () => {
    const body = validBody();
    delete (body as Record<string, unknown>)[CAPTCHA_FIELD];
    expect(parseSubmission(body).captchaToken).toBe("");
  });

  test("rejects a filled honeypot as spam", () => {
    expect(() =>
      parseSubmission({ ...validBody(), [HONEYPOT_FIELD]: "http://spam.example" }),
    ).toThrow(SpamRejectedError);
  });

  test("allows a minimal inquiry (only required fields)", () => {
    const { inquiry } = parseSubmission({
      contactName: "Asha",
      contactPhone: "+911234567",
      consent: true,
    });
    expect(inquiry.offerAmount).toBeUndefined();
    expect(inquiry.message).toBeUndefined();
    // preferred_contact defaults to phone in leads-core.
    expect(inquiry.preferredContact).toBe("phone");
  });

  test("rejects unknown fields via the strict leads-core schema", () => {
    expect(() =>
      parseSubmission({
        contactName: "Asha",
        contactPhone: "+911234567",
        consent: true,
        sellerId: "user_hax", // server-owned; must never be mass-assigned
      }),
    ).toThrow(ZodError);
  });

  test("rejects a missing required field", () => {
    expect(() => parseSubmission({ contactPhone: "+911234567", consent: true })).toThrow(
      ZodError,
    );
  });

  test("rejects consent that is not explicitly true", () => {
    expect(() =>
      parseSubmission({
        contactName: "Asha",
        contactPhone: "+911234567",
        consent: false,
      }),
    ).toThrow(ZodError);
  });

  test("treats a non-object body as invalid", () => {
    expect(() => parseSubmission(null)).toThrow(ZodError);
    expect(() => parseSubmission("nope")).toThrow(ZodError);
  });
});
