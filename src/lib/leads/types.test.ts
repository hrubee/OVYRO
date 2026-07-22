import { describe, expect, test } from "bun:test";
import { serialize, type LeadRow } from "./types";

const baseRow: LeadRow = {
  id: "lead_1",
  listingId: "listing_1",
  buyerId: "buyer_1",
  sellerId: "seller_1",
  offerAmount: "2400000.00",
  message: "Interested",
  contactName: "Asha Rao",
  contactPhone: "+919876543210",
  contactEmail: "asha@example.com",
  preferredContact: "whatsapp",
  consentAt: new Date("2026-07-22T05:00:00.000Z"),
  status: "new",
  sellerFirstViewedAt: null,
  emailDeliveredAt: null,
  metaEventId: "01J000000000000000000META",
  fbp: "fb.1.123.456",
  fbc: "fb.1.123.abc",
  clientIp: "203.0.113.7",
  clientUa: "Mozilla/5.0",
  createdAt: new Date("2026-07-22T05:00:00.000Z"),
  updatedAt: new Date("2026-07-22T06:00:00.000Z"),
};

describe("serialize (spec §4.2.2, §6)", () => {
  test("coerces the numeric offer to a number and dates to ISO strings", () => {
    const dto = serialize(baseRow);
    expect(dto.offerAmount).toBe(2_400_000);
    expect(dto.consentAt).toBe("2026-07-22T05:00:00.000Z");
    expect(dto.createdAt).toBe("2026-07-22T05:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-07-22T06:00:00.000Z");
  });

  test("keeps null optionals null", () => {
    const dto = serialize(baseRow);
    expect(dto.sellerFirstViewedAt).toBeNull();
    expect(dto.emailDeliveredAt).toBeNull();
  });

  test("preserves null offer amounts", () => {
    const dto = serialize({ ...baseRow, offerAmount: null, message: null });
    expect(dto.offerAmount).toBeNull();
    expect(dto.message).toBeNull();
  });

  test("never leaks server-internal attribution fields", () => {
    const dto = serialize(baseRow);
    for (const field of ["metaEventId", "fbp", "fbc", "clientIp", "clientUa"]) {
      expect(dto).not.toHaveProperty(field);
    }
  });
});
