/**
 * Admin moderation queue (spec §4.1.3) — `/admin/listings`.
 *
 * Server component: gated to admins, renders the pending-review listings
 * server-side, and hands them to the client `ModerationTable` for the
 * approve/reject actions. Anonymous visitors are bounced to login; authenticated
 * non-admins get a 404 so the admin surface stays hidden (spec §4.1).
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { listModerationListings } from "@/app/api/admin/listings/_lib/queries";
import { ModerationTable } from "./_components/moderation-table";

export const metadata: Metadata = { title: "Moderation queue · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin/listings");
  if (!isAdmin(actor.roles)) notFound();

  const pending = await listModerationListings({ status: "pending_review" });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Moderation queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pending.length === 0
            ? "No listings are awaiting review."
            : `${pending.length} listing${pending.length === 1 ? "" : "s"} awaiting review.`}
        </p>
      </header>

      <ModerationTable listings={pending} />
    </main>
  );
}
