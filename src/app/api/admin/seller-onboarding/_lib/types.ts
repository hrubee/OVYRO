/**
 * Admin wire shape for the seller-onboarding review surface (spec §4.2.4).
 *
 * An admin submission is the shared `OnboardingDTO` (state, seller_type,
 * legal_name, address, id_document, review metadata) plus the joined applicant
 * contact the reviewer needs to make and communicate a decision. The buyer
 * surface uses the bare DTO; only the admin surface carries the applicant.
 */
import type { OnboardingDTO } from "@/lib/onboarding";

/** The applicant behind an application — joined from `users` for the reviewer. */
export interface OnboardingApplicant {
  id: string;
  name: string;
  email: string;
}

export interface AdminOnboardingSubmission extends OnboardingDTO {
  applicant: OnboardingApplicant;
}
