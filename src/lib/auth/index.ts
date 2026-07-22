import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import { trackSignup } from "@/lib/analytics";
import { db } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  oauthAccounts,
  sessions,
  userRoles,
  users,
  verifications,
} from "@/lib/db/schema";
import { sendOtpEmail } from "./otp-delivery";
import {
  SUSPENDED_SIGN_IN_CODE,
  SUSPENDED_SIGN_IN_MESSAGE,
  isLoginBlocked,
} from "./suspension";

/**
 * Better Auth over the spec §6 tables. Two things are load-bearing here:
 *
 * 1. `fields` maps Better Auth's model fields onto the Drizzle property names
 *    where the spec's naming differs. Everything else lines up by convention.
 * 2. The `user.create.after` hook grants the `buyer` role — spec §3.1 makes
 *    buyer the default role for every registered user. Roles live only in the
 *    `user_roles` join table; there is no role column on `users`.
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: oauthAccounts,
      verification: verifications,
    },
  }),

  advanced: {
    database: {
      // ULIDs for auth-created rows too, so every PK in the DB sorts by time.
      generateId: () => newId(),
    },
  },

  user: {
    fields: {
      image: "avatarUrl",
    },
  },

  account: {
    fields: {
      providerId: "provider",
      accountId: "providerAccountId",
      password: "passwordHash",
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most daily
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: false,
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db
            .insert(userRoles)
            .values({ userId: user.id, role: "buyer" })
            .onConflictDoNothing();

          // New-account funnel event (spec §10). Buyer is the default role at
          // signup (seller is granted later via onboarding), so it is stamped
          // into props for the rollup's buyer/seller split. Best-effort —
          // `trackSignup` swallows its own write errors and never blocks signup.
          await trackSignup({ userId: user.id, role: "buyer" });
        },
      },
      update: {
        before: async (user) => {
          // Keep the auditable timestamp in step with Better Auth's boolean.
          if (user.emailVerified === true) {
            return { data: { ...user, emailVerifiedAt: new Date() } };
          }
        },
      },
    },
    session: {
      create: {
        /**
         * Suspended-cannot-login (spec §14). This fires for every sign-in path
         * that mints a session — email/password, email OTP, and OAuth — so a
         * `suspended` (or soft-deleted) account is rejected once, here, rather
         * than per credential type. Throwing an `APIError` aborts the sign-in
         * with a clean 403 instead of silently issuing no cookie.
         */
        before: async (session) => {
          const [row] = await db
            .select({ status: users.status })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);

          if (isLoginBlocked(row?.status)) {
            throw new APIError("FORBIDDEN", {
              code: SUSPENDED_SIGN_IN_CODE,
              message: SUSPENDED_SIGN_IN_MESSAGE,
            });
          }
        },
      },
    },
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 3,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendOtpEmail({ email, otp, type });
      },
    }),
    // Must stay last: it flushes Set-Cookie from server actions.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
