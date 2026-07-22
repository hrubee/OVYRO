import { describe, expect, test } from "bun:test";
import {
  FLAG_CATALOG,
  FLAG_KEYS,
  flagDefinition,
  isKnownFlag,
} from "./catalog";

describe("FLAG_CATALOG", () => {
  test("is non-empty and includes the moderation auto-approve toggle (spec §4.1.6)", () => {
    expect(FLAG_CATALOG.length).toBeGreaterThan(0);
    expect(FLAG_KEYS).toContain("listing_auto_approve");
  });

  test("every flag key is unique", () => {
    expect(new Set(FLAG_KEYS).size).toBe(FLAG_KEYS.length);
  });

  test("every flag has a non-empty label and description", () => {
    for (const flag of FLAG_CATALOG) {
      expect(flag.label.length).toBeGreaterThan(0);
      expect(flag.description.length).toBeGreaterThan(0);
      expect(["moderation", "platform"]).toContain(flag.group);
    }
  });
});

describe("isKnownFlag", () => {
  test("accepts catalog keys and rejects everything else", () => {
    expect(isKnownFlag("listing_auto_approve")).toBe(true);
    expect(isKnownFlag("definitely_not_a_flag")).toBe(false);
    expect(isKnownFlag("")).toBe(false);
  });
});

describe("flagDefinition", () => {
  test("resolves a known key to its definition", () => {
    expect(flagDefinition("listing_auto_approve")?.group).toBe("moderation");
  });

  test("returns undefined for an unknown key", () => {
    expect(flagDefinition("nope")).toBeUndefined();
  });
});
