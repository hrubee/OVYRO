import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { userRoles } from "@/lib/db/schema";
import { auth } from "./index";
import { AuthorizationError, hasRole, type Role } from "./roles";

export class AuthenticationError extends Error {
  readonly code = "UNAUTHORIZED";
  readonly status = 401;

  constructor(message = "You must be signed in to do that.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** The signed-in user plus their granted roles, as every guard wants it. */
export interface Actor {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
}

/** Roles granted in the join table. Implication is applied by `hasRole`. */
export async function getUserRoles(userId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  return rows.map((row) => row.role);
}

/** Current actor, or null when anonymous. Public pages call this and carry on. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roles: await getUserRoles(session.user.id),
  };
}

/**
 * Buyer-facing gate. Spec §3.1: buyer features check "is authenticated", never
 * `role === 'buyer'` — so this asks for a session and nothing more.
 */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AuthenticationError();
  return actor;
}

/** Seller- and admin-gated routes. 401 when anonymous, 403 when under-privileged. */
export async function requireActorWithRole(role: Role): Promise<Actor> {
  const actor = await requireActor();
  if (!hasRole(actor.roles, role)) {
    throw new AuthorizationError(`This action requires the ${role} role.`);
  }
  return actor;
}

/**
 * Grant a role. Idempotent — the join table's composite PK makes a repeat
 * grant a no-op rather than a duplicate row.
 *
 * `admin` is never granted through a self-serve path (spec §3.1); it comes
 * from `scripts/seed.ts` or an existing admin acting deliberately.
 */
export async function grantRole(userId: string, role: Role): Promise<void> {
  await db.insert(userRoles).values({ userId, role }).onConflictDoNothing();
}

export async function revokeRole(userId: string, role: Role): Promise<void> {
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
}
