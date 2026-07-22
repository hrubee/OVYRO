/**
 * Typed errors for the buyer → seller onboarding API (spec §4.2.4).
 *
 * Both satisfy the structural `{ status, code, message }` shape that the shared
 * `/api/me` {@link mapErrorToResponse} recognises, so they map to the standard
 * error envelope without any extra wiring. `OnboardingTransitionError` (from
 * `@/lib/onboarding`) already carries the same shape (409 INVALID_TRANSITION)
 * and is handled the same way.
 */

/**
 * The caller already holds the `seller` role (or an approved application), so
 * there is nothing to onboard. A 409 rather than a 403: it is a state conflict,
 * not a permission failure — they have *more* access, not less.
 */
export class AlreadyOnboardedError extends Error {
  readonly code = "ALREADY_ONBOARDED";
  readonly status = 409;

  constructor(message = "You're already a seller.") {
    super(message);
    this.name = "AlreadyOnboardedError";
  }
}

/**
 * The application is `submitted` and awaiting admin review — it cannot be edited
 * until it is approved or rejected. A rejected application, by contrast, is
 * reopened for editing on the next save (`rejected → in_progress`).
 */
export class OnboardingLockedError extends Error {
  readonly code = "ONBOARDING_LOCKED";
  readonly status = 409;

  constructor(
    message = "Your application is under review and can't be edited right now.",
  ) {
    super(message);
    this.name = "OnboardingLockedError";
  }
}
