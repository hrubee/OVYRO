import { describe, expect, test } from "bun:test";
import type { OnboardingRow } from "@/lib/onboarding";
import { toBuyerDTO } from "./dto";

const baseRow: OnboardingRow = {
  id: "onb_1",
  userId: "user_1",
  step: 3,
  state: "rejected",
  sellerType: "individual",
  legalName: "Ada Lovelace",
  addressJson: { line1: "1 Main St", city: "Pune", country: "IN" },
  idDocumentUrl: null,
  termsAcceptedAt: new Date("2026-07-20T00:00:00.000Z"),
  reviewedBy: "admin_9",
  reviewNote: "Legal name doesn't match the ID document.",
  submittedAt: new Date("2026-07-21T00:00:00.000Z"),
  createdAt: new Date("2026-07-19T00:00:00.000Z"),
  updatedAt: new Date("2026-07-21T00:00:00.000Z"),
};

describe("toBuyerDTO", () => {
  test("drops the admin-internal reviewedBy", () => {
    const dto = toBuyerDTO(baseRow);
    expect("reviewedBy" in dto).toBe(false);
  });

  test("keeps the buyer-facing rejection note", () => {
    const dto = toBuyerDTO(baseRow);
    expect(dto.reviewNote).toBe("Legal name doesn't match the ID document.");
  });

  test("surfaces the structured address and derived termsAccepted", () => {
    const dto = toBuyerDTO(baseRow);
    expect(dto.address).toEqual({ line1: "1 Main St", city: "Pune", country: "IN" });
    expect(dto.termsAccepted).toBe(true);
    expect(dto.submittedAt).toBe("2026-07-21T00:00:00.000Z");
  });
});
