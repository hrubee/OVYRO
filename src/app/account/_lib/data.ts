/**
 * Server-side helpers shared by the buyer-account pages (spec §4.2).
 *
 * Access is gated on "is signed in", never a role check (spec §3.1): every
 * registered user — buyer or seller — has an account area. Anonymous visitors
 * are redirected to sign in rather than shown a 401, since these are pages.
 */
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getActor, type Actor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** The signed-in actor, or a redirect to the login page when anonymous. */
export async function requireAccountActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

export interface AccountProfile {
  name: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
}

/** The editable profile fields for the settings page. */
export async function getAccountProfile(userId: string): Promise<AccountProfile> {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      phoneVerifiedAt: users.phoneVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    name: row?.name ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? null,
    phoneVerified: row?.phoneVerifiedAt !== null && row?.phoneVerifiedAt !== undefined,
  };
}
