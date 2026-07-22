/**
 * Read-side of the admin users table (spec §4.1.2). Kept apart from the write
 * service (`actions.ts`) so the admin page can render the table without pulling
 * in the queue/audit producers — it only needs the DB.
 *
 * The per-user aggregates (inquiries made, live listings, Meta status, roles)
 * are fetched as a handful of grouped follow-up queries keyed by the page's user
 * ids, not as one correlated-subquery mega-join and never per-row — so the cost
 * is a fixed ~5 queries regardless of page size.
 */
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Role } from "@/lib/auth/roles";
import {
  leads,
  listings,
  metaConnections,
  userRoles,
  users,
} from "@/lib/db/schema";
import type {
  AdminUserFilters,
  AdminUserRow,
  MetaConnectionState,
  UserStatus,
} from "./types";

/** Cap the table at a sane page size; the search box is the real navigation. */
const DEFAULT_LIMIT = 100;

function countByKey(
  rows: { key: string; count: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.key, Number(row.count));
  return map;
}

/**
 * List users for the admin table, newest first, with the filters spec §4.1.2
 * asks for (free-text name/email search, role, status). Includes soft-deleted
 * rows only when explicitly filtered to `status=deleted`; otherwise they are
 * hidden so the default view is live accounts.
 */
export async function listUsers(
  filters: AdminUserFilters = {},
): Promise<AdminUserRow[]> {
  const where = [];

  if (filters.q && filters.q.trim().length > 0) {
    const term = `%${filters.q.trim()}%`;
    where.push(or(ilike(users.name, term), ilike(users.email, term)));
  }
  if (filters.status) {
    where.push(eq(users.status, filters.status));
  } else {
    // Default view hides anonymized, soft-deleted accounts.
    where.push(isNull(users.deletedAt));
  }
  if (filters.role) {
    where.push(
      inArray(
        users.id,
        db
          .select({ id: userRoles.userId })
          .from(userRoles)
          .where(eq(userRoles.role, filters.role)),
      ),
    );
  }

  const base = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      signupAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
    })
    .from(users)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(DEFAULT_LIMIT);

  const ids = base.map((row) => row.id);
  if (ids.length === 0) return [];

  const [roleRows, inquiryRows, listingRows, metaRows] = await Promise.all([
    db
      .select({ userId: userRoles.userId, role: userRoles.role })
      .from(userRoles)
      .where(inArray(userRoles.userId, ids)),
    db
      .select({
        key: leads.buyerId,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .where(inArray(leads.buyerId, ids))
      .groupBy(leads.buyerId),
    db
      .select({
        key: listings.sellerId,
        count: sql<number>`count(*)::int`,
      })
      .from(listings)
      .where(and(inArray(listings.sellerId, ids), isNull(listings.deletedAt)))
      .groupBy(listings.sellerId),
    db
      .select({ userId: metaConnections.userId, status: metaConnections.status })
      .from(metaConnections)
      .where(inArray(metaConnections.userId, ids)),
  ]);

  const rolesByUser = new Map<string, Role[]>();
  for (const row of roleRows) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push(row.role);
    rolesByUser.set(row.userId, list);
  }

  const inquiriesByUser = countByKey(inquiryRows);
  const listingsByUser = countByKey(listingRows);

  const metaByUser = new Map<string, MetaConnectionState>();
  for (const row of metaRows) metaByUser.set(row.userId, row.status);

  return base.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    roles: rolesByUser.get(row.id) ?? [],
    status: row.status as UserStatus,
    signupAt: row.signupAt.toISOString(),
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    inquiriesMade: inquiriesByUser.get(row.id) ?? 0,
    listingsCount: listingsByUser.get(row.id) ?? 0,
    metaConnection: metaByUser.get(row.id) ?? "none",
  }));
}
