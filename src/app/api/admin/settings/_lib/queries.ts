/**
 * Read-side of the admin settings surface (spec §4.1.6). Kept apart from the
 * write service so the settings page can render without importing the audit
 * producer.
 *
 * `listFlags` is catalog-driven: it always returns one row per known flag,
 * merging in the stored `enabled`/`updated_at` where a `flags` row exists and
 * defaulting to `false` where it does not (a never-toggled flag has no row yet).
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { flags, userRoles, users } from "@/lib/db/schema";
import { FLAG_CATALOG, FLAG_KEYS } from "./catalog";
import type { AdminFlag, AdminSummary } from "./types";

/** Every catalog flag with its current stored state (default off). */
export async function listFlags(): Promise<AdminFlag[]> {
  const rows =
    FLAG_KEYS.length === 0
      ? []
      : await db
          .select({
            key: flags.key,
            enabled: flags.enabled,
            updatedAt: flags.updatedAt,
          })
          .from(flags)
          .where(inArray(flags.key, [...FLAG_KEYS]));

  const stored = new Map(rows.map((row) => [row.key, row]));

  return FLAG_CATALOG.map((def) => {
    const row = stored.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      group: def.group,
      enabled: row?.enabled ?? false,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });
}

/** The current admins, for the settings page's admin-management stub. */
export async function listAdmins(): Promise<AdminSummary[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(eq(userRoles.role, "admin"))
    .orderBy(users.email);

  return rows;
}
