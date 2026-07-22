/**
 * Eligibility guards for creating an inquiry (spec §3.1, §4.2.2).
 *
 * Pure predicates + assertions, decoupled from the DB and the session so they
 * unit-test in isolation. The buyer gate itself is "is authenticated" (never a
 * `role === 'buyer'` check) and lives in the route via `requireActor`; these
 * cover the two inquiry-specific rules layered on top:
 *   - a seller cannot inquire on their own listing, and
 *   - the caller's phone must be verified before their first inquiry.
 */
import { PhoneNotVerifiedError, SelfInquiryError } from "./http";

/** True when `actorId` owns the listing they're trying to inquire on. */
export function isSelfInquiry(actorId: string, sellerId: string): boolean {
  return actorId === sellerId;
}

/** True once the caller has completed phone-OTP verification. */
export function isPhoneVerified(phoneVerifiedAt: Date | null | undefined): boolean {
  return phoneVerifiedAt != null;
}

/** Throws `SelfInquiryError` (403) when the caller owns the listing. */
export function assertNotSelfInquiry(actorId: string, sellerId: string): void {
  if (isSelfInquiry(actorId, sellerId)) {
    throw new SelfInquiryError();
  }
}

/** Throws `PhoneNotVerifiedError` (403) when the caller's phone is unverified. */
export function assertPhoneVerified(
  phoneVerifiedAt: Date | null | undefined,
): void {
  if (!isPhoneVerified(phoneVerifiedAt)) {
    throw new PhoneNotVerifiedError();
  }
}
