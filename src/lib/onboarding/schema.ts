/**
 * Zod (v4) input schemas for the buyer → seller onboarding wizard (spec §4.2.4).
 *
 * Two schemas share one set of field validators so they can never disagree on
 * how a given field is validated:
 *   - `onboardingStepSchema` — a per-step save. Every field is optional (the
 *     wizard is resumable, so a buyer saves whatever they have so far) and,
 *     crucially, there are *no* `.default()`s: an absent field must leave the
 *     stored value untouched, not reset it. Built explicitly rather than via
 *     `.partial()`, which keeps `.default()` active for absent keys.
 *   - `onboardingSubmitSchema` — the complete application. Everything required
 *     except the feature-flagged ID document, and `termsAccepted` must be
 *     explicitly `true` (the acceptance is timestamped on submit).
 *
 * The `seller_type` enum is reused directly from the Drizzle pgEnum so
 * validation can never drift from the column. Keys are the camelCase Drizzle
 * property names (matching `lib/listings/schema`); the structured `address`
 * object is persisted to the `address_json` jsonb column.
 *
 * `.strict()` blocks mass-assignment of server-owned fields (state, reviewedBy,
 * reviewNote, submittedAt, userId, …) that never come from the wizard.
 */
import { z } from "zod";
import { sellerType } from "@/lib/db/schema";

// Reusable field validators — shared between the step-save and submit schemas.
const sellerTypeField = z.enum(sellerType.enumValues);
const legalName = z.string().trim().min(1).max(200);
/** Presigned R2 URL for the optional identity document (spec §4.2.4, §11 R-1). */
const idDocumentUrl = z.string().trim().min(1).max(2048).pipe(z.url());
/** Which wizard step the buyer last reached; persisted for resumability. */
const step = z.number().int().min(0).max(50);
/** Terms acceptance is mandatory at submit and must be explicitly `true`. */
const termsAcceptedTrue = z
  .boolean()
  .refine((value) => value === true, "You must accept the seller terms.");

// Address sub-field validators. `country` mirrors the listings ISO 3166-1
// alpha-2 rule so the two address shapes stay consistent.
const addrLine = z.string().trim().min(1).max(200);
const addrLine2 = z.string().trim().max(200);
const addrCity = z.string().trim().min(1).max(120);
const addrRegion = z.string().trim().max(120);
const addrPostalCode = z.string().trim().max(20);
const addrCountry = z
  .string()
  .trim()
  .toUpperCase()
  .length(2)
  .regex(/^[A-Z]{2}$/, "Country must be a 2-letter ISO 3166-1 code");

/**
 * Complete structured address (persisted as `address_json`). `line2`, `region`
 * and `postalCode` are optional; the rest are required at submit. `.strict()`
 * keeps stray keys out of the jsonb blob.
 */
export const onboardingAddressSchema = z
  .object({
    line1: addrLine,
    line2: addrLine2.optional(),
    city: addrCity,
    region: addrRegion.optional(),
    postalCode: addrPostalCode.optional(),
    country: addrCountry,
  })
  .strict();

/**
 * Partial address for a mid-wizard save — every sub-field optional so a buyer
 * can persist a half-filled address. Built explicitly (not `.partial()`) to
 * match the rest of the module.
 */
const onboardingAddressPartialSchema = z
  .object({
    line1: addrLine.optional(),
    line2: addrLine2.optional(),
    city: addrCity.optional(),
    region: addrRegion.optional(),
    postalCode: addrPostalCode.optional(),
    country: addrCountry.optional(),
  })
  .strict();

/** Per-step save: everything optional, no defaults. */
export const onboardingStepSchema = z
  .object({
    step: step.optional(),
    sellerType: sellerTypeField.optional(),
    legalName: legalName.optional(),
    address: onboardingAddressPartialSchema.optional(),
    idDocumentUrl: idDocumentUrl.optional(),
    termsAccepted: z.boolean().optional(),
  })
  .strict();

/** Complete application: required except the feature-flagged ID document. */
export const onboardingSubmitSchema = z
  .object({
    sellerType: sellerTypeField,
    legalName,
    address: onboardingAddressSchema,
    idDocumentUrl: idDocumentUrl.optional(),
    termsAccepted: termsAcceptedTrue,
  })
  .strict();

export type OnboardingAddressInput = z.infer<typeof onboardingAddressSchema>;
export type OnboardingStepInput = z.infer<typeof onboardingStepSchema>;
export type OnboardingSubmitInput = z.infer<typeof onboardingSubmitSchema>;
