/**
 * Idempotent dev-login seed: one known-credential account per app view.
 *
 * Provisions exactly three users so the whole site can be explored per role
 * without going through signup or email/phone OTP. Every account is created
 * through Better Auth (so the password hash matches the login path and the
 * `buyer` role hook fires) and marked email-verified, so all three can log in
 * immediately with the fixed passwords printed at the end of the run.
 *
 *   bun run seed:dev        # or: bun run scripts/seed-dev-users.ts
 *
 * The three accounts (spec §3.1 additive roles — never a role column):
 *   1. buyer@ovyro.dev   — buyer only            → lands on /account
 *   2. seller@ovyro.dev  — buyer + seller        → /dashboard + role switcher
 *   3. admin@ovyro.dev   — buyer + admin         → /admin
 *
 * The seller also carries a `seller_profiles` row (so the role switcher and the
 * dashboard resolve a display name) and a verified phone (so buyer-side flows
 * that gate on `phone_verified_at`, e.g. inquiry submission, work). The admin is
 * granted `buyer` on purpose here — a dev convenience so buyer surfaces and the
 * role helpers resolve for the exploration account — even though production
 * admins are not buyers (spec §3.2).
 *
 * Re-running is safe: each user is looked up by email, roles are added with
 * `onConflictDoNothing`, and the profile upsert is a no-op when present. These
 * are dev-only credentials for local/staging exploration, never production.
 *
 * Env: DATABASE_URL (required — read by `@/lib/db`, like the other seeds).
 */
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, pool } from "@/lib/db";
import { sellerProfiles, userRoles, users } from "@/lib/db/schema";
import type { Role } from "@/lib/auth/roles";

/**
 * Fixed, known dev passwords — the whole point of this seed is credentials you
 * can memorise. Each satisfies Better Auth's `minPasswordLength: 10` rule (see
 * `src/lib/auth/index.ts`) with mixed case, a digit, and a symbol.
 */
interface DevUserSpec {
  email: string;
  password: string;
  name: string;
  /** Roles to guarantee, additive. `buyer` is also granted by the signup hook. */
  roles: readonly Role[];
  /** Present only for the seller: a profile + verified phone. */
  sellerDisplayName?: string;
  /** E.164 phone to stamp as verified (seller only). */
  verifiedPhone?: string;
  /** Where this account is meant to land, for the printed summary. */
  landsOn: string;
}

const DEV_USERS: readonly DevUserSpec[] = [
  {
    email: "buyer@ovyro.dev",
    password: "BuyerDev#2026",
    name: "Dev Buyer",
    roles: ["buyer"],
    landsOn: "/account",
  },
  {
    email: "seller@ovyro.dev",
    password: "SellerDev#2026",
    name: "Dev Seller",
    roles: ["buyer", "seller"],
    sellerDisplayName: "Dev Seller Co.",
    verifiedPhone: "+919000000002",
    landsOn: "/dashboard",
  },
  {
    email: "admin@ovyro.dev",
    password: "AdminDev#2026",
    name: "Dev Admin",
    roles: ["buyer", "admin"],
    landsOn: "/admin",
  },
];

async function findUserByEmail(email: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

/**
 * Create (or reuse) one dev user and bring its roles, verification state, and —
 * for the seller — profile and phone up to spec. Every step is idempotent so the
 * seed can be re-run against an existing database without duplicating anything.
 */
async function ensureDevUser(spec: DevUserSpec): Promise<void> {
  let user = await findUserByEmail(spec.email);

  if (user) {
    console.info(`· dev user already exists: ${spec.email}`);
  } else {
    /**
     * Sign up through Better Auth rather than inserting rows by hand, so the
     * password hash matches exactly what the login path verifies against — and
     * so the default `buyer` role hook fires like it would for any signup.
     */
    await auth.api.signUpEmail({
      body: { email: spec.email, password: spec.password, name: spec.name },
    });
    console.info(`✓ created dev user ${spec.email}`);
    user = await findUserByEmail(spec.email);
  }
  if (!user) throw new Error(`dev user ${spec.email} missing after signup`);

  // Additive roles (spec §3.1): every account gets its full role set via the
  // join table, never a role column. `onConflictDoNothing` keeps re-runs safe
  // and also backfills the `buyer` row if the signup hook never fired.
  await db
    .insert(userRoles)
    .values(spec.roles.map((role) => ({ userId: user.id, role })))
    .onConflictDoNothing();

  // Dev accounts skip the verification email — mark them verified directly so
  // they can log in immediately. Keep the boolean and the auditable timestamp
  // in step, exactly as the auth update hook does.
  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, user.id));

  if (spec.sellerDisplayName) {
    // A display name is what the role switcher and dashboard header resolve;
    // seller_profiles has a unique index on user_id, so this is a no-op on re-run.
    await db
      .insert(sellerProfiles)
      .values({ userId: user.id, displayName: spec.sellerDisplayName })
      .onConflictDoNothing();
  }

  if (spec.verifiedPhone) {
    // Stamp phone + phone_verified_at the same way POST /api/auth/otp/verify
    // does, so buyer-side flows that gate on a verified phone (inquiry
    // submission, spec §4.2.2) accept this account.
    await db
      .update(users)
      .set({ phone: spec.verifiedPhone, phoneVerifiedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));
  console.info(`  roles for ${spec.email}: ${roles.map((r) => r.role).join(", ")}`);
}

function printCredentials(): void {
  console.info("\n──────────────── dev login credentials ────────────────");
  console.info("Log in at /login with any of these (all email-verified):\n");
  for (const spec of DEV_USERS) {
    const label = spec.email.split("@")[0].padEnd(6);
    console.info(
      `  ${label}  ${spec.email.padEnd(18)} ${spec.password.padEnd(16)} → ${spec.landsOn}`,
    );
  }
  console.info("────────────────────────────────────────────────────────");
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed dev users.");
  }

  for (const spec of DEV_USERS) {
    await ensureDevUser(spec);
  }

  printCredentials();
  console.info("dev users seed complete.");
}

main()
  .catch((error) => {
    console.error("dev users seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
