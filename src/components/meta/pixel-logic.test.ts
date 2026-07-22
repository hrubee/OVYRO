import { describe, expect, test } from "bun:test";
import {
  contentParams,
  isValidPixelId,
  normalizePixelId,
  pixelBootScript,
  pixelIdForOwner,
  resolveOwnerPixelId,
} from "./pixel-logic";

const PIXEL_A = "111111111111";
const PIXEL_B = "222222222222";

describe("isValidPixelId / normalizePixelId", () => {
  test("accepts a numeric id and trims surrounding space", () => {
    expect(isValidPixelId("123456789012")).toBe(true);
    expect(normalizePixelId("  123456789012  ")).toBe("123456789012");
  });

  test("rejects non-numeric, too-short, and non-string input", () => {
    for (const bad of ["", "12345", "abc123456789", "12 34 5678", "<script>"]) {
      expect(isValidPixelId(bad)).toBe(false);
      expect(normalizePixelId(bad)).toBeNull();
    }
    expect(normalizePixelId(null)).toBeNull();
    expect(normalizePixelId(123 as unknown)).toBeNull();
  });
});

describe("resolveOwnerPixelId", () => {
  test("returns the id only for an active connection with a valid pixel", () => {
    expect(resolveOwnerPixelId({ pixelId: PIXEL_A, status: "active" })).toBe(
      PIXEL_A,
    );
  });

  test("no pixel fires when the owner has no connection", () => {
    expect(resolveOwnerPixelId(null)).toBeNull();
    expect(resolveOwnerPixelId(undefined)).toBeNull();
  });

  test("no pixel fires for a non-active status or a blank/invalid id", () => {
    expect(
      resolveOwnerPixelId({ pixelId: PIXEL_A, status: "disconnected" }),
    ).toBeNull();
    expect(
      resolveOwnerPixelId({ pixelId: PIXEL_A, status: "needs_reauth" }),
    ).toBeNull();
    expect(resolveOwnerPixelId({ pixelId: null, status: "active" })).toBeNull();
    expect(resolveOwnerPixelId({ pixelId: "nope", status: "active" })).toBeNull();
  });
});

describe("pixelIdForOwner — R-4 isolation", () => {
  const byOwnerId = {
    "seller-a": { pixelId: PIXEL_A, status: "active" },
    "seller-b": { pixelId: PIXEL_B, status: "active" },
  };

  test("a listing resolves only its own owner's pixel", () => {
    expect(pixelIdForOwner("seller-a", byOwnerId)).toBe(PIXEL_A);
    expect(pixelIdForOwner("seller-b", byOwnerId)).toBe(PIXEL_B);
  });

  test("seller B's page never resolves seller A's pixel", () => {
    expect(pixelIdForOwner("seller-b", byOwnerId)).not.toBe(PIXEL_A);
  });

  test("an owner with no connection resolves to no pixel", () => {
    expect(pixelIdForOwner("seller-c", byOwnerId)).toBeNull();
  });
});

describe("contentParams", () => {
  test("builds standard product content for a listing", () => {
    expect(
      contentParams({ listingId: "listing-1", value: 1200000, currency: "INR" }),
    ).toEqual({
      content_ids: ["listing-1"],
      content_type: "product",
      value: 1200000,
      currency: "INR",
    });
  });
});

describe("pixelBootScript — R-4 isolation", () => {
  const content = contentParams({
    listingId: "listing-b",
    value: 500000,
    currency: "USD",
  });

  test("inits exactly the given pixel and fires PageView + ViewContent", () => {
    const script = pixelBootScript(PIXEL_B, content);
    expect(script).toContain(`fbq('init','${PIXEL_B}')`);
    expect(script).toContain("fbq('track','PageView')");
    expect(script).toContain("fbq('track','ViewContent'");
    expect(script).toContain('"content_ids":["listing-b"]');
    expect(script).toContain('"currency":"USD"');
  });

  test("seller B's boot script never contains seller A's pixel id", () => {
    const script = pixelBootScript(PIXEL_B, content);
    expect(script).not.toContain(PIXEL_A);
  });

  test("refuses to boot with a non-numeric id (never reaches the DOM)", () => {
    expect(() => pixelBootScript("<script>", content)).toThrow();
    expect(() => pixelBootScript("", content)).toThrow();
  });

  test("escapes `<` so params cannot break out of the inline script", () => {
    const script = pixelBootScript(
      PIXEL_A,
      contentParams({ listingId: "a</script>b", value: 1, currency: "USD" }),
    );
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c/script>");
  });
});
