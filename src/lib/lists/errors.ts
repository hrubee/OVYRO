/**
 * Typed errors for saved-list mutations. Each carries the numeric `status` +
 * string `code` shape the `/api/me` route mapper switches on, so the handlers
 * never grow a try/catch of their own (mirrors `@/lib/auth` + `@/lib/listings`).
 */

/** Postgres unique-violation SQLSTATE — a duplicate (user_id, name) list. */
const PG_UNIQUE_VIOLATION = "23505";

/** A list name the user already uses (the (user_id, name) unique index). */
export class ListConflictError extends Error {
  readonly code = "LIST_NAME_TAKEN";
  readonly status = 409;

  constructor(message = "You already have a list with that name.") {
    super(message);
    this.name = "ListConflictError";
  }
}

/** The auto-created default wishlist cannot be renamed or deleted. */
export class DefaultListError extends Error {
  readonly code = "DEFAULT_LIST_IMMUTABLE";
  readonly status = 409;

  constructor(message = "Your default wishlist can't be renamed or deleted.") {
    super(message);
    this.name = "DefaultListError";
  }
}

/** True when a thrown DB error is a Postgres unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}
