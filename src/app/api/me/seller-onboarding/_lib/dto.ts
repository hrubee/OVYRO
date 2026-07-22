/**
 * Buyer-facing serialization for the seller-onboarding surface (spec §4.2.4).
 *
 * The shared `serialize` (from `@/lib/onboarding`) includes `reviewedBy` — the
 * reviewing admin's user id, which is admin-internal moderation metadata. The
 * types module is explicit that buyer surfaces must drop it, so this is the one
 * chokepoint that does, and every buyer route/page renders through it. The
 * buyer-safe `reviewNote` (the rejection reason) is kept.
 */
import { serialize, type OnboardingDTO, type OnboardingRow } from "@/lib/onboarding";

/** The onboarding DTO minus the admin-internal `reviewedBy`. */
export type BuyerOnboardingDTO = Omit<OnboardingDTO, "reviewedBy">;

/**
 * Serialize a row for the applicant. Built as an explicit *allowlist* rather
 * than "spread minus `reviewedBy`" so a future admin-internal field added to
 * `OnboardingDTO` can never silently leak to a buyer — it just won't be copied.
 */
export function toBuyerDTO(row: OnboardingRow): BuyerOnboardingDTO {
  const dto = serialize(row);
  return {
    id: dto.id,
    userId: dto.userId,
    step: dto.step,
    state: dto.state,
    sellerType: dto.sellerType,
    legalName: dto.legalName,
    address: dto.address,
    idDocumentUrl: dto.idDocumentUrl,
    termsAccepted: dto.termsAccepted,
    termsAcceptedAt: dto.termsAcceptedAt,
    reviewNote: dto.reviewNote,
    submittedAt: dto.submittedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/**
 * What the buyer sees when loading their onboarding progress. `isSeller` lets
 * the wizard short-circuit to "you're already a seller" without inferring it
 * from the (possibly absent) application row, and `onboarding` is `null` for a
 * buyer who has never started.
 */
export interface OnboardingProgressDTO {
  isSeller: boolean;
  onboarding: BuyerOnboardingDTO | null;
}
