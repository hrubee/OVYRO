import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMetaMarketingSettings } from "@/app/api/dashboard/marketing/_lib/repo";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MetaPixelForm } from "./_components/meta-pixel-form";

export const metadata: Metadata = { title: "Marketing" };

// Reads the signed-in seller's pixel connection, so it must render per request.
export const dynamic = "force-dynamic";

/**
 * Seller marketing settings (spec §5.2). Gating mirrors the rest of the
 * dashboard: anonymous → login, signed-in-but-not-a-seller → the dashboard
 * home. The seller connects their OWN Meta Pixel here; their public listing
 * pages then fire it client-side (after cookie consent) — no OAuth, no tokens.
 */
export default async function MarketingSettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!isSeller(actor.roles)) redirect("/dashboard");

  const settings = await getMetaMarketingSettings(db, actor.userId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Connect your own Meta Pixel so your Facebook &amp; Instagram ad
          campaigns can track views and inquiries on your Ovyro listing pages.
        </p>
      </div>

      <MetaPixelForm initialSettings={settings} />
    </main>
  );
}
