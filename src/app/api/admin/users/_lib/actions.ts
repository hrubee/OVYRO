/**
 * Admin user write service (spec §4.1.2, §3.2).
 *
 * Every mutation runs in one transaction that locks the user row, applies the
 * change, and writes an `admin_audit_log` row with a before/after snapshot
 * (spec §10) — so the action and its audit trail commit or roll back together.
 *
 * Actions never touch a `role` column (there is none): the seller override is
 * additive on the `user_roles` join table (spec §3.1), and a soft-delete
 * anonymizes in place rather than dropping the row, so audit history and foreign
 * keys survive. Already soft-deleted accounts are treated as gone (404).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { adminAuditLog, userRoles, users } from "@/lib/db/schema";
import { NotFoundError } from "./http";
import {
  OVERRIDABLE_ROLE,
  anonymizedUserPatch,
  assertNotSelf,
  userSnapshot,
} from "./plan";
import type { UserStatus } from "./types";

/** POST body for the seller-role override. */
export const roleActionSchema = z.object({
  action: z.enum(["grant", "revoke"]),
});

export type RoleAction = z.infer<typeof roleActionSchema>["action"];

export interface StatusResult {
  id: string;
  status: UserStatus;
}

export interface RolesResult {
  id: string;
  roles: Role[];
}

async function setStatus(
  actor: Actor,
  userId: string,
  status: "active" | "suspended",
): Promise<StatusResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!row || row.deletedAt) throw new NotFoundError();

    const [next] = await tx
      .update(users)
      .set({ status })
      .where(eq(users.id, userId))
      .returning();

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: status === "suspended" ? "user.suspend" : "user.unsuspend",
      entityType: "user",
      entityId: userId,
      beforeJsonb: userSnapshot(row),
      afterJsonb: userSnapshot(next!),
    });

    return { id: next!.id, status: next!.status as UserStatus };
  });
}

/** Suspend a user — they can no longer sign in (spec §14). Not allowed on self. */
export async function suspendUser(
  actor: Actor,
  userId: string,
): Promise<StatusResult> {
  assertNotSelf(actor.userId, userId);
  return setStatus(actor, userId, "suspended");
}

/** Lift a suspension, returning the account to `active`. */
export async function unsuspendUser(
  actor: Actor,
  userId: string,
): Promise<StatusResult> {
  return setStatus(actor, userId, "active");
}

/**
 * Grant or revoke the `seller` role as a manual admin override (spec §3.1).
 * Grant is idempotent (the join table's composite PK); revoke leaves `buyer`
 * untouched — roles are additive, never a column.
 */
export async function setSellerRole(
  actor: Actor,
  userId: string,
  action: RoleAction,
): Promise<RolesResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!row || row.deletedAt) throw new NotFoundError();

    const before = (
      await tx
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
    ).map((r) => r.role);

    if (action === "grant") {
      await tx
        .insert(userRoles)
        .values({ userId, role: OVERRIDABLE_ROLE })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(userRoles)
        .where(
          and(eq(userRoles.userId, userId), eq(userRoles.role, OVERRIDABLE_ROLE)),
        );
    }

    const after = (
      await tx
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
    ).map((r) => r.role);

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: `user.role.${action}`,
      entityType: "user",
      entityId: userId,
      beforeJsonb: { roles: before },
      afterJsonb: { roles: after },
    });

    return { id: userId, roles: after };
  });
}

/**
 * Soft-delete + GDPR-style anonymization (spec §4.1.2): stamp `deleted_at`, move
 * to `deleted`, and scrub the PII on the users row. Not allowed on self.
 */
export async function softDeleteUser(
  actor: Actor,
  userId: string,
): Promise<StatusResult> {
  assertNotSelf(actor.userId, userId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!row || row.deletedAt) throw new NotFoundError();

    const [next] = await tx
      .update(users)
      .set(anonymizedUserPatch(userId))
      .where(eq(users.id, userId))
      .returning();

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: "user.soft_delete",
      entityType: "user",
      entityId: userId,
      beforeJsonb: userSnapshot(row),
      afterJsonb: userSnapshot(next!),
    });

    return { id: next!.id, status: next!.status as UserStatus };
  });
}
