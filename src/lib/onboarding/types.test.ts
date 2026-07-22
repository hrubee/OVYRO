import { describe, expect, test } from "bun:test";
import { serialize, type OnboardingRow } from "./types";

const baseRow: OnboardingRow = {
  id: "onb_1",
  userId: "user_1",
  step: 2,
  state: "submitted",
  sellerType: "broker",
  legalName: "Asha Rao",
  addressJson: {
    line1: "12 MG Road",
    city: "Pune",
    region: "Maharashtra",
    country: "IN",
  },
  idDocumentUrl: "https://cdn.ovyro.example/id/doc-123.pdf",
  termsAcceptedAt: new Date("2026-07-22T05:00:00.000Z"),
  reviewedBy: null,
  reviewNote: null,
  submittedAt: new Date("2026-07-22T05:30:00.000Z"),
  createdAt: new Date("2026-07-22T04:00:00.000Z"),
  updatedAt: new Date("2026-07-22T05:30:00.000Z"),
};

describe("serialize (spec §4.2.4, §6)", () => {
  test("emits dates as ISO strings and passes scalars through", () => {
    const dto = serialize(baseRow);
    expect(dto.id).toBe("onb_1");
    expect(dto.step).toBe(2);
    expect(dto.state).toBe("submitted");
    expect(dto.sellerType).toBe("broker");
    expect(dto.submittedAt).toBe("2026-07-22T05:30:00.000Z");
    expect(dto.createdAt).toBe("2026-07-22T04:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-07-22T05:30:00.000Z");
  });

  test("surfaces the structured address from the jsonb column", () => {
    const dto = serialize(baseRow);
    expect(dto.address).toEqual({
      line1: "12 MG Road",
      city: "Pune",
      region: "Maharashtra",
      country: "IN",
    });
  });

  test("collapses terms_accepted_at into a boolean plus the raw timestamp", () => {
    const accepted = serialize(baseRow);
    expect(accepted.termsAccepted).toBe(true);
    expect(accepted.termsAcceptedAt).toBe("2026-07-22T05:00:00.000Z");

    const notAccepted = serialize({ ...baseRow, termsAcceptedAt: null });
    expect(notAccepted.termsAccepted).toBe(false);
    expect(notAccepted.termsAcceptedAt).toBeNull();
  });

  test("keeps null optionals null", () => {
    const dto = serialize({
      ...baseRow,
      state: "in_progress",
      sellerType: null,
      legalName: null,
      addressJson: null,
      idDocumentUrl: null,
      submittedAt: null,
    });
    expect(dto.sellerType).toBeNull();
    expect(dto.legalName).toBeNull();
    expect(dto.address).toBeNull();
    expect(dto.idDocumentUrl).toBeNull();
    expect(dto.submittedAt).toBeNull();
  });

  test("carries the admin review fields for a rejected application", () => {
    const dto = serialize({
      ...baseRow,
      state: "rejected",
      reviewedBy: "user_admin",
      reviewNote: "Legal name does not match the ID document.",
    });
    expect(dto.reviewedBy).toBe("user_admin");
    expect(dto.reviewNote).toBe("Legal name does not match the ID document.");
  });
});
