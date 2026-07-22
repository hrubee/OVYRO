import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serialize } from "@/lib/leads";
import {
  listSellerLeads,
  listSellerListingOptions,
} from "@/app/api/dashboard/leads/_lib/repo";
import { LeadsInbox } from "./_components/leads-inbox";

export const metadata: Metadata = { title: "Lead inbox" };

/**
 * Seller lead inbox (spec §4.3.2). Server-renders the full lead set (via the
 * denormalized `seller_id`) plus the listing options for the filter control;
 * from there the client {@link LeadsInbox} refetches through the API as filters
 * change. Gating mirrors the listings dashboard: anonymous → login,
 * authenticated-but-not-a-seller → the dashboard home.
 */
export default async function LeadsInboxPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!isSeller(actor.roles)) redirect("/dashboard");

  const [rows, listingOptions] = await Promise.all([
    listSellerLeads(db, actor.userId),
    listSellerListingOptions(db, actor.userId),
  ]);
  const leads = rows.map(serialize);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lead inbox</h1>
        <p className="text-sm text-muted-foreground">
          Every inquiry across your listings. Filter, follow up, and move each
          lead through your pipeline.
        </p>
      </div>

      <LeadsInbox initialLeads={leads} listingOptions={listingOptions} />
    </main>
  );
}
