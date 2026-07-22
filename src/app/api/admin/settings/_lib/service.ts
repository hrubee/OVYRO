/**
 * Admin settings write service (spec §4.1.6, §3.2).
 *
 * `setFlag` upserts one `flags` row and writes an `admin_audit_log` before/after
 * in the same transaction. The key must be in the catalog — an unknown key is a
 * 404, never a new flag row (the catalog is the source of truth for which flags
 * exist). A never-toggled flag has no row, so `before.enabled` defaults to
 * `false`, matching what the read side renders.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { adminAuditLog, flags } from "@/lib/db/schema";
import { flagDefinition } from "./catalog";
import { NotFoundError } from "./http";
import type { AdminFlag } from "./types";

/** PATCH body for a flag toggle. */
export const flagToggleSchema = z.object({
  enabled: z.boolean(),
});

export type FlagToggleInput = z.infer<typeof flagToggleSchema>;

/** Toggle a known feature flag, auditing the before/after. */
export async function setFlag(
  actor: Actor,
  key: string,
  enabled: boolean,
): Promise<AdminFlag> {
  const def = flagDefinition(key);
  if (!def) throw new NotFoundError("Unknown feature flag.");

  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ enabled: flags.enabled })
      .from(flags)
      .where(eq(flags.key, key))
      .for("update");

    const before = { enabled: existing?.enabled ?? false };

    const [next] = await tx
      .insert(flags)
      .values({ key, enabled })
      .onConflictDoUpdate({
        target: flags.key,
        // $onUpdate does not fire on an upsert, so bump updated_at explicitly.
        set: { enabled, updatedAt: new Date() },
      })
      .returning();

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: "flag.set",
      entityType: "flag",
      entityId: key,
      beforeJsonb: before,
      afterJsonb: { enabled: next!.enabled },
    });

    return next!;
  });

  return {
    key: def.key,
    label: def.label,
    description: def.description,
    group: def.group,
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}
