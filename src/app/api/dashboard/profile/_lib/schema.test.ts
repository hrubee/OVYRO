import { describe, expect, test } from "bun:test";
import {
  DEFAULT_NOTIFICATION_PREFS,
  notificationPrefsSchema,
  sellerProfileUpdateSchema,
} from "./schema";

describe("sellerProfileUpdateSchema", () => {
  test("accepts a full profile and trims text fields", () => {
    const parsed = sellerProfileUpdateSchema.parse({
      displayName: "  Green Acres Land  ",
      about: "  We sell farmland.  ",
      logoUrl: "  https://cdn.example.com/logo.png  ",
      notificationPrefs: { leadEmail: false, leadSms: true, productUpdates: false },
    });
    expect(parsed).toEqual({
      displayName: "Green Acres Land",
      about: "We sell farmland.",
      logoUrl: "https://cdn.example.com/logo.png",
      notificationPrefs: { leadEmail: false, leadSms: true, productUpdates: false },
    });
  });

  test("display name is required (blank fails)", () => {
    const parsed = sellerProfileUpdateSchema.safeParse({ displayName: "   " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "Add a display name buyers will see.",
      );
    }
  });

  test("optional fields default to empty / default prefs when omitted", () => {
    const parsed = sellerProfileUpdateSchema.parse({ displayName: "Solo Seller" });
    expect(parsed.about).toBe("");
    expect(parsed.logoUrl).toBe("");
    expect(parsed.notificationPrefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  test("empty logo URL is allowed (clears the field)", () => {
    const parsed = sellerProfileUpdateSchema.parse({
      displayName: "Seller",
      logoUrl: "",
    });
    expect(parsed.logoUrl).toBe("");
  });

  test("a non-URL logo value is rejected", () => {
    const parsed = sellerProfileUpdateSchema.safeParse({
      displayName: "Seller",
      logoUrl: "not-a-url",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "Enter a valid URL, or leave it blank.",
      );
    }
  });

  test("rejects unknown top-level keys (mass-assignment guard)", () => {
    const parsed = sellerProfileUpdateSchema.safeParse({
      displayName: "Seller",
      userId: "usr_hacker",
    });
    expect(parsed.success).toBe(false);
  });

  test("over-long display name is rejected", () => {
    const parsed = sellerProfileUpdateSchema.safeParse({
      displayName: "x".repeat(121),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("notificationPrefsSchema", () => {
  test("requires all three booleans", () => {
    expect(
      notificationPrefsSchema.safeParse({ leadEmail: true, leadSms: false }).success,
    ).toBe(false);
  });

  test("rejects unknown keys", () => {
    const parsed = notificationPrefsSchema.safeParse({
      ...DEFAULT_NOTIFICATION_PREFS,
      smsSpam: true,
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects non-boolean values", () => {
    const parsed = notificationPrefsSchema.safeParse({
      leadEmail: "yes",
      leadSms: false,
      productUpdates: true,
    });
    expect(parsed.success).toBe(false);
  });
});
