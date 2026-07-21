/**
 * Role logic (spec §3). Deliberately dependency-free — no DB, no session, no
 * request — so it is cheap to unit test and impossible to accidentally couple
 * to a transport.
 */

export const ROLES = ["buyer", "seller", "admin"] as const;

export type Role = (typeof ROLES)[number];

/**
 * Which roles each granted role implies.
 *
 * `seller` implies `buyer`: spec §3.1 requires the seller experience to be a
 * strict superset of the buyer one. We encode the implication here *as well as*
 * granting an explicit `buyer` row at signup, so a seller still passes buyer
 * checks even if the join-table row is ever missing.
 *
 * `admin` implies nothing. It is not a buyer: per the §3.2 permission matrix an
 * admin cannot submit inquiries or keep saved lists. Admin capability is
 * additive over the platform, not over the marketplace.
 */
const ROLE_IMPLIES: Record<Role, readonly Role[]> = {
  buyer: [],
  seller: ["buyer"],
  admin: [],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Expand granted roles into everything they imply (transitive closure).
 * `['seller']` → `{ seller, buyer }`.
 */
export function expandRoles(granted: readonly Role[]): Set<Role> {
  const effective = new Set<Role>();
  const queue = [...granted];

  while (queue.length > 0) {
    const role = queue.pop() as Role;
    if (effective.has(role)) continue;
    effective.add(role);
    queue.push(...ROLE_IMPLIES[role]);
  }

  return effective;
}

/** True when `granted` confers `required`, directly or by implication. */
export function hasRole(granted: readonly Role[], required: Role): boolean {
  return expandRoles(granted).has(required);
}

export function hasAnyRole(
  granted: readonly Role[],
  required: readonly Role[],
): boolean {
  const effective = expandRoles(granted);
  return required.some((role) => effective.has(role));
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Throws `AuthorizationError` unless `granted` confers `required`. */
export function requireRole(
  granted: readonly Role[],
  required: Role,
): void {
  if (!hasRole(granted, required)) {
    throw new AuthorizationError(`This action requires the ${required} role.`);
  }
}

export function requireAnyRole(
  granted: readonly Role[],
  required: readonly Role[],
): void {
  if (!hasAnyRole(granted, required)) {
    throw new AuthorizationError(
      `This action requires one of: ${required.join(", ")}.`,
    );
  }
}

export function isAdmin(granted: readonly Role[]): boolean {
  return hasRole(granted, "admin");
}

export function isSeller(granted: readonly Role[]): boolean {
  return hasRole(granted, "seller");
}

/**
 * There is intentionally no `isBuyer`. Spec §3.1: buyer-facing features gate on
 * "is authenticated", never on `role === 'buyer'` — every registered user is a
 * buyer, so a role check there can only ever be a bug. Use this instead.
 */
export function canUseBuyerFeatures(session: { userId: string } | null): boolean {
  return session !== null;
}

/**
 * Ownership check for listings, leads, and media (spec §3.2 guard rails):
 * the owner, or an admin acting for moderation.
 */
export function canMutateOwned(
  actor: { userId: string; roles: readonly Role[] },
  ownerId: string,
): boolean {
  return actor.userId === ownerId || isAdmin(actor.roles);
}

/**
 * A seller cannot inquire on their own listing — it would let them inflate
 * their own lead stats (spec §3.2). Admins do not inquire at all.
 */
export function canInquireOnListing(
  actor: { userId: string; roles: readonly Role[] } | null,
  listing: { sellerId: string },
): boolean {
  if (actor === null) return false;
  if (isAdmin(actor.roles)) return false;
  return actor.userId !== listing.sellerId;
}
