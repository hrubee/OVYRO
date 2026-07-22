/**
 * Pure column mapping for the seller-onboarding writes (spec §4.2.4, §6).
 *
 * Kept DB-free so the two subtle rules — partial-address *merge* and the
 * "leave-untouched vs. reset" step-save semantics — are unit-testable without a
 * database. The route handlers stay thin: parse → map → persist.
 */
import type {
  OnboardingAddress,
  OnboardingState,
  OnboardingStepInput,
  OnboardingSubmitInput,
  SellerType,
} from "@/lib/onboarding";

/** Columns a write may touch. Absent keys are left untouched by the caller. */
export interface OnboardingColumnPatch {
  step?: number;
  sellerType?: SellerType;
  legalName?: string;
  addressJson?: OnboardingAddress;
  idDocumentUrl?: string;
  termsAcceptedAt?: Date | null;
  state?: OnboardingState;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  submittedAt?: Date | null;
}

/** The existing-row facts a step patch needs to honour "leave untouched". */
export interface StepPatchContext {
  addressJson: unknown;
  termsAcceptedAt: Date | null;
}

/**
 * Turn a validated step-save into a column patch. Every field is optional and
 * an absent one is simply omitted from the patch (the caller's `update` then
 * leaves the stored value alone) — a mid-wizard save must never reset a field
 * the buyer filled on an earlier step.
 *
 * The `address` is *merged* onto the stored address rather than replacing it,
 * so saving one address sub-field never wipes the others (the same
 * leave-untouched rule, one level deeper). `termsAccepted` maps to the
 * timestamp column: `true` keeps any existing acceptance instant (or stamps
 * `now` the first time), `false` clears it.
 */
export function buildStepPatch(
  input: OnboardingStepInput,
  existing: StepPatchContext | null,
  now: Date,
): OnboardingColumnPatch {
  const patch: OnboardingColumnPatch = {};

  if (input.step !== undefined) patch.step = input.step;
  if (input.sellerType !== undefined) patch.sellerType = input.sellerType;
  if (input.legalName !== undefined) patch.legalName = input.legalName;
  if (input.idDocumentUrl !== undefined) patch.idDocumentUrl = input.idDocumentUrl;

  if (input.address !== undefined) {
    const current = (existing?.addressJson ?? {}) as Partial<OnboardingAddress>;
    patch.addressJson = { ...current, ...input.address } as OnboardingAddress;
  }

  if (input.termsAccepted !== undefined) {
    patch.termsAcceptedAt = input.termsAccepted
      ? (existing?.termsAcceptedAt ?? now)
      : null;
  }

  return patch;
}

/**
 * The complete set of columns written on submit. Everything required is present
 * (the submit schema guaranteed it), the terms acceptance is (re)stamped at the
 * legally-binding moment, and any prior review metadata is cleared so a resubmit
 * reaches the admin as a clean `submitted` row.
 */
export function buildSubmitValues(
  input: OnboardingSubmitInput,
  now: Date,
): OnboardingColumnPatch {
  return {
    sellerType: input.sellerType,
    legalName: input.legalName,
    addressJson: input.address,
    idDocumentUrl: input.idDocumentUrl,
    termsAcceptedAt: now,
    state: "submitted",
    submittedAt: now,
    reviewNote: null,
    reviewedBy: null,
  };
}
