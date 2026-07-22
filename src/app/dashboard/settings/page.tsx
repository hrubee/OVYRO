import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSellerProfileOrDefault } from "@/app/api/dashboard/profile/_lib/repo";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SellerProfileForm } from "./_components/seller-profile-form";

export const metadata: Metadata = { title: "Seller profile" };

// Reads the signed-in seller's profile, so it must render per request.
export const dynamic = "force-dynamic";

/**
 * Seller profile settings (spec §4.3). Gating mirrors the rest of the dashboard:
 * anonymous → login, signed-in-but-not-a-seller → the dashboard home. The
 * profile is loaded server-side (seeded from the account name when the seller
 * has never saved one) and handed to the client form, which persists changes
 * through `PUT /api/dashboard/profile`.
 */
export default async function SellerSettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!isSeller(actor.roles)) redirect("/dashboard");

  const profile = await getSellerProfileOrDefault(db, actor.userId, actor.name);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seller profile</h1>
        <p className="text-sm text-muted-foreground">
          This is how buyers see you. Your display name appears on every listing
          you publish.
        </p>
      </div>

      <SellerProfileForm initialProfile={profile} />
    </main>
  );
}
