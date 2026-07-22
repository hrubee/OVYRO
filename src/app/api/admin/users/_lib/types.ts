/**
 * Wire shapes for the admin users surface (spec §4.1.2). No DB / no server-only
 * imports so the client `users-table` can `import type` these freely.
 */
import type { Role } from "@/lib/auth/roles";

export type UserStatus = "active" | "suspended" | "deleted";

/** Meta (Facebook) connection state shown in the table; `none` = never connected. */
export type MetaConnectionState =
  | "none"
  | "active"
  | "needs_reauth"
  | "disconnected";

/** One row of the admin users table, with the per-user aggregates joined in. */
export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  /** Granted roles (join table), e.g. `["buyer", "seller"]`. */
  roles: Role[];
  status: UserStatus;
  signupAt: string;
  lastActiveAt: string | null;
  /** Inquiries this user has submitted as a buyer (lead count by buyer). */
  inquiriesMade: number;
  /** Live (non-deleted) listings this user owns as a seller. */
  listingsCount: number;
  metaConnection: MetaConnectionState;
}

/** The filters the list endpoint understands (spec §4.1.2: searchable/filterable). */
export interface AdminUserFilters {
  /** Free-text search across name + email. */
  q?: string;
  role?: Role;
  status?: UserStatus;
}
