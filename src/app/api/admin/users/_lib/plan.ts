/**
 * Pure planning + snapshots for the admin user actions (spec §4.1.2).
 *
 * Dependency-free (no DB, no session) so the anonymization scrub, the
 * before/after audit snapshot shape, and the self-action guard are all
 * unit-testable in isolation. The service layer (`actions.ts`) is a thin adapter
 * that locks the row, applies these patches, and writes the `admin_audit_log`
 * row (spec §3.2 / §10).
 */
import type { UserStatus } from "./types";

/** The additive role an admin may grant/revoke as a manual override (spec §3.1). */
export const OVERRIDABLE_ROLE = "seller" as const;

/**
 * An admin cannot suspend or soft-delete their own account — that would let an
 * admin lock themselves (and possibly the last admin) out. Grant/revoke and the
 * read paths are unaffected.
 */
export class SelfActionError extends Error {
  readonly code = "SELF_ACTION";
  readonly status = 400;

  constructor(message = "You cannot perform this action on your own account.") {
    super(message);
    this.name = "SelfActionError";
  }
}

/** Throws {@link SelfActionError} when the actor is targeting themselves. */
export function assertNotSelf(actorId: string, targetId: string): void {
  if (actorId === targetId) {
    throw new SelfActionError();
  }
}

/** The subset of the users row captured in an audit-log before/after snapshot. */
export interface UserSnapshot {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: UserStatus;
  deletedAt: string | null;
}

export function userSnapshot(row: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: UserStatus;
  deletedAt: Date | null;
}): UserSnapshot {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    status: row.status,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/**
 * The column patch that soft-deletes and anonymizes a user (spec §4.1.2,
 * GDPR-style scrub). Sets `deleted_at`, moves the account to `deleted`, and
 * scrubs the directly-identifying PII on the users row.
 *
 * The email is replaced with a deterministic, per-user placeholder rather than
 * nulled: `users.email` is `NOT NULL` with a unique index, so every scrubbed
 * address must stay distinct. `@deleted.invalid` is in the reserved `.invalid`
 * TLD (RFC 2606) so it can never collide with, or be mistaken for, a real inbox.
 */
export interface AnonymizedUserPatch {
  status: "deleted";
  deletedAt: Date;
  email: string;
  name: string;
  phone: null;
  avatarUrl: null;
  emailVerified: false;
  emailVerifiedAt: null;
  phoneVerifiedAt: null;
}

export function anonymizedUserPatch(
  userId: string,
  now: Date = new Date(),
): AnonymizedUserPatch {
  return {
    status: "deleted",
    deletedAt: now,
    email: `deleted+${userId}@deleted.invalid`,
    name: "Deleted user",
    phone: null,
    avatarUrl: null,
    emailVerified: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
  };
}
