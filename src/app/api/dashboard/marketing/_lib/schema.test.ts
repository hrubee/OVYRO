import { describe, expect, test } from "bun:test";
import { metaPixelUpdateSchema } from "./schema";

describe("metaPixelUpdateSchema", () => {
  test("accepts a numeric pixel id and trims it", () => {
    const parsed = metaPixelUpdateSchema.parse({ pixelId: "  123456789012  " });
    expect(parsed).toEqual({ pixelId: "123456789012" });
  });

  test("rejects a non-numeric id", () => {
    const parsed = metaPixelUpdateSchema.safeParse({ pixelId: "pixel-123" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("valid Meta Pixel ID");
    }
  });

  test("rejects a blank id", () => {
    expect(metaPixelUpdateSchema.safeParse({ pixelId: "   " }).success).toBe(
      false,
    );
  });

  test("rejects unknown keys (no mass-assignment of server columns)", () => {
    const parsed = metaPixelUpdateSchema.safeParse({
      pixelId: "123456789012",
      status: "active",
      accessTokenEncrypted: "x",
    });
    expect(parsed.success).toBe(false);
  });
});
