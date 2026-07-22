/**
 * Sign-in gate for non-active accounts (spec §14 acceptance: a suspended user
 * cannot log in).
 *
 * Deliberately dependency-free — no DB, no Better Auth, no request — so the
 * "which statuses are blocked" rule is a pure, unit-testable decision. The auth
 * layer (`src/lib/auth/index.ts`) wires it into Better Auth's
 * `session.create.before` hook, which fires for *every* sign-in path
 * (email/password, email OTP, OAuth) — so there is one enforcement point rather
 * than one per credential type.
 *
 * `deleted` is blocked alongside `suspended`: a soft-deleted / anonymized user
 * (see the admin soft-delete flow) must never be able to re-establish a session
 * either.
 */

/** The `user_status` values that must be rejected at sign-in. */
export const LOGIN_BLOCKED_STATUSES = ["suspended", "deleted"] as const;

export type LoginBlockedStatus = (typeof LOGIN_BLOCKED_STATUSES)[number];

/** True when an account in this status must not be allowed to create a session. */
export function isLoginBlocked(status: string | null | undefined): boolean {
  return (
    status != null &&
    (LOGIN_BLOCKED_STATUSES as readonly string[]).includes(status)
  );
}

/** Error `code` returned to the client when a blocked account tries to sign in. */
export const SUSPENDED_SIGN_IN_CODE = "ACCOUNT_SUSPENDED";

/** User-facing message for a blocked sign-in. Never leaks why beyond "suspended". */
export const SUSPENDED_SIGN_IN_MESSAGE =
  "This account has been suspended. Contact support if you believe this is a mistake.";
