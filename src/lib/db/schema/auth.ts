import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { deletedAt, idColumn, timestamps } from "./columns";
import { userRole, userStatus } from "./enums";

/**
 * Better Auth owns the read/write path for these four tables (spec §6 allows
 * sessions to be "managed by auth lib"; the same applies to the account and
 * verification records it needs). Column names follow spec §6; the Drizzle
 * property names are what Better Auth's adapter binds to, with the remaining
 * gaps mapped explicitly in `src/lib/auth/index.ts`.
 */

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    email: text("email").notNull(),
    /**
     * Better Auth requires a boolean `emailVerified`; spec §6 asks for a
     * timestamp. Both are kept: the boolean is the auth-library contract, the
     * timestamp is the auditable fact. Write them together.
     */
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phone: text("phone"),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    name: text("name").notNull(),
    /** Better Auth's `image` field maps here. */
    avatarUrl: text("avatar_url"),
    status: userStatus("status").notNull().default("active"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_key").on(table.email),
    index("users_phone_idx").on(table.phone),
    index("users_status_idx").on(table.status),
  ],
);

/**
 * Additive roles (spec §3.1). A seller carries BOTH a `seller` and a `buyer`
 * row — there is deliberately no role column on `users`, because a single enum
 * is what breaks "seller has everything a buyer has". Buyer-facing checks are
 * "is authenticated", never `role === 'buyer'` — see `src/lib/auth/roles.ts`.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRole("role").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index("user_roles_role_idx").on(table.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_key").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

/**
 * Spec §6 calls this `oauth_accounts` and puts `password_hash` on `users`.
 * Better Auth instead keeps every credential — OAuth grants and the
 * email/password hash alike — in one account table, with the password row
 * carrying `provider = 'credential'`. We follow Better Auth: keeping a
 * `users.password_hash` column that the auth library never reads or writes
 * would be a live foot-gun for anyone who later authenticated against it.
 */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'credential' for email/password, otherwise 'google' | 'facebook'. */
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    passwordHash: text("password_hash"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("oauth_accounts_provider_account_key").on(
      table.provider,
      table.providerAccountId,
    ),
    index("oauth_accounts_user_id_idx").on(table.userId),
  ],
);

/** Better Auth's store for email-verification tokens and email OTP codes. */
export const verifications = pgTable(
  "verifications",
  {
    id: idColumn(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
    index("verifications_expires_at_idx").on(table.expiresAt),
  ],
);
