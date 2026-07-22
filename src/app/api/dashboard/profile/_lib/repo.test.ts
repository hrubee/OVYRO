import { describe, expect, test } from "bun:test";
import { DEFAULT_NOTIFICATION_PREFS } from "./schema";
import {
  defaultProfile,
  normalizeInput,
  parseNotificationPrefs,
  serializeRow,
} from "./repo";

describe("parseNotificationPrefs", () => {
  test("passes a well-formed prefs object through unchanged", () => {
    const prefs = { leadEmail: false, leadSms: true, productUpdates: false };
    expect(parseNotificationPrefs(prefs)).toEqual(prefs);
  });

  test("falls back to defaults for null (row predates prefs)", () => {
    expect(parseNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  test("falls back to defaults for a partial object", () => {
    expect(parseNotificationPrefs({ leadEmail: false })).toEqual(
      DEFAULT_NOTIFICATION_PREFS,
    );
  });

  test("falls back to defaults for a non-object blob", () => {
    expect(parseNotificationPrefs("nope")).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  test("falls back to defaults when an unexpected key is present", () => {
    expect(
      parseNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, extra: true }),
    ).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });
});

describe("serializeRow", () => {
  test("maps columns and parses the jsonb prefs blob", () => {
    const dto = serializeRow({
      displayName: "Green Acres",
      about: "Farmland specialists.",
      logoUrl: "https://cdn.example.com/logo.png",
      notificationPrefsJson: {
        leadEmail: true,
        leadSms: true,
        productUpdates: false,
      },
    });
    expect(dto).toEqual({
      displayName: "Green Acres",
      about: "Farmland specialists.",
      logoUrl: "https://cdn.example.com/logo.png",
      notificationPrefs: { leadEmail: true, leadSms: true, productUpdates: false },
    });
  });

  test("keeps null about / logo and defaults absent prefs", () => {
    const dto = serializeRow({
      displayName: "Solo Seller",
      about: null,
      logoUrl: null,
      notificationPrefsJson: null,
    });
    expect(dto.about).toBeNull();
    expect(dto.logoUrl).toBeNull();
    expect(dto.notificationPrefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });
});

describe("defaultProfile", () => {
  test("seeds display name from the account name and nulls the rest", () => {
    expect(defaultProfile("  Jordan Rivers  ")).toEqual({
      displayName: "Jordan Rivers",
      about: null,
      logoUrl: null,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    });
  });
});

describe("normalizeInput", () => {
  test("empty about / logo become null; prefs pass through", () => {
    const values = normalizeInput({
      displayName: "Seller",
      about: "",
      logoUrl: "",
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    });
    expect(values).toEqual({
      displayName: "Seller",
      about: null,
      logoUrl: null,
      notificationPrefsJson: DEFAULT_NOTIFICATION_PREFS,
    });
  });

  test("non-empty about / logo are preserved", () => {
    const values = normalizeInput({
      displayName: "Seller",
      about: "About us",
      logoUrl: "https://cdn.example.com/logo.png",
      notificationPrefs: { leadEmail: false, leadSms: false, productUpdates: false },
    });
    expect(values.about).toBe("About us");
    expect(values.logoUrl).toBe("https://cdn.example.com/logo.png");
    expect(values.notificationPrefsJson).toEqual({
      leadEmail: false,
      leadSms: false,
      productUpdates: false,
    });
  });
});
