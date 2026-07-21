/**
 * Idempotent seed: bootstraps the platform admin.
 *
 * `admin` is the one role that is never self-serve (spec §3.1) — this script is
 * the only place it is granted. Re-running is safe: the account is looked up by
 * email and the role grant is a no-op on conflict.
 *
 *   bun run seed
 *
 * Env: ADMIN_EMAIL (default admin@ovyro.local), ADMIN_PASSWORD (generated and
 * printed once if unset), ADMIN_NAME.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, pool } from "@/lib/db";
import { userRoles, users } from "@/lib/db/schema";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@ovyro.local").toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Ovyro Admin";

function generatePassword(): string {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

async function findUserByEmail(email: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

async function seedAdmin(): Promise<void> {
  const existing = await findUserByEmail(ADMIN_EMAIL);

  if (existing) {
    console.info(`· admin user already exists: ${ADMIN_EMAIL}`);
  } else {
    const password = process.env.ADMIN_PASSWORD ?? generatePassword();

    /**
     * Sign up through Better Auth rather than inserting rows by hand, so the
     * password hash matches exactly what the login path verifies against — and
     * so the `buyer` role hook fires like it would for any other signup.
     */
    await auth.api.signUpEmail({
      body: { email: ADMIN_EMAIL, password, name: ADMIN_NAME },
    });

    console.info(`✓ created admin user ${ADMIN_EMAIL}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.info(`  generated password (shown once): ${password}`);
    }
  }

  const admin = await findUserByEmail(ADMIN_EMAIL);
  if (!admin) throw new Error(`admin user ${ADMIN_EMAIL} missing after signup`);

  // The admin is also a buyer and a seller: roles are additive, so granting
  // admin never takes the marketplace surfaces away (spec §3.1).
  await db
    .insert(userRoles)
    .values([
      { userId: admin.id, role: "buyer" },
      { userId: admin.id, role: "admin" },
    ])
    .onConflictDoNothing();

  // Admin is bootstrapped out of band, so there is no verification email to
  // click — mark it verified directly.
  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, admin.id));

  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, admin.id));

  console.info(`✓ roles for ${ADMIN_EMAIL}: ${roles.map((r) => r.role).join(", ")}`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed.");
  }

  await seedAdmin();
  console.info("seed complete.");
}

main()
  .catch((error) => {
    console.error("seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
