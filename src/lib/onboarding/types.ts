/**
 * Shared seller-onboarding DTO + serializer (spec §4.2.4, §6).
 *
 * `serialize` turns a Drizzle `seller_onboarding` row into a JSON-safe shape
 * that both the buyer onboarding flow and the admin review surface render from,
 * so the two can never disagree on the wire format. Conversions handled here:
 *   - timestamptz columns arrive as `Date` → emitted as ISO-8601 strings
 *   - `terms_accepted_at` collapses to a `termsAccepted` boolean for the UI,
 *     while the raw timestamp is kept for the admin record
 *   - `address_json` jsonb arrives as `unknown` → surfaced as the structured
 *     `OnboardingAddress` it was written as (writes are validated by
 *     `onboardingAddressSchema`)
 *
 * `reviewedBy` is the reviewing admin's user id — admin-internal moderation
 * metadata. Route handlers serving the buyer should drop it; `reviewNote` is
 * the buyer-facing rejection reason and is safe to show the applicant.
 */
import type { InferSelectModel } from "drizzle-orm";
import { sellerOnboarding, sellerType } from "@/lib/db/schema";
import type { OnboardingState } from "./status";

export type OnboardingRow = InferSelectModel<typeof sellerOnboarding>;

export type SellerType = (typeof sellerType.enumValues)[number];

/** Structured address stored in the `address_json` column. */
export interface OnboardingAddress {
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
}

export interface OnboardingDTO {
  id: string;
  userId: string;
  step: number;
  state: OnboardingState;
  sellerType: SellerType | null;
  legalName: string | null;
  address: OnboardingAddress | null;
  idDocumentUrl: string | null;
  /** Derived from `terms_accepted_at` — true once the buyer accepted. */
  termsAccepted: boolean;
  termsAcceptedAt: string | null;
  /** Buyer-facing rejection reason (spec §4.2.4). */
  reviewNote: string | null;
  /** Admin-internal — the reviewing admin's user id; drop for buyer surfaces. */
  reviewedBy: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/** Serialize a seller-onboarding row for buyer/admin surfaces. */
export function serialize(row: OnboardingRow): OnboardingDTO {
  return {
    id: row.id,
    userId: row.userId,
    step: row.step,
    state: row.state,
    sellerType: row.sellerType,
    legalName: row.legalName,
    address: (row.addressJson ?? null) as OnboardingAddress | null,
    idDocumentUrl: row.idDocumentUrl,
    termsAccepted: row.termsAcceptedAt !== null,
    termsAcceptedAt: isoOrNull(row.termsAcceptedAt),
    reviewNote: row.reviewNote,
    reviewedBy: row.reviewedBy,
    submittedAt: isoOrNull(row.submittedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
