/**
 * Admin seller-application review queue (spec §4.2.4) — `/admin/onboarding`.
 *
 * Server component: gated to admins, renders the submitted applications
 * server-side, and hands them to the client `OnboardingReviewTable` for the
 * approve/reject actions. Anonymous visitors are bounced to login; authenticated
 * non-admins get a 404 so the admin surface stays hidden (spec §4.1).
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { listOnboardingSubmissions } from "@/app/api/admin/seller-onboarding/_lib/queries";
import { OnboardingReviewTable } from "./_components/onboarding-review-table";

export const metadata: Metadata = { title: "Seller applications · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin/onboarding");
  if (!isAdmin(actor.roles)) notFound();

  const pending = await listOnboardingSubmissions({ state: "submitted" });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Seller applications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pending.length === 0
            ? "No applications are awaiting review."
            : `${pending.length} application${pending.length === 1 ? "" : "s"} awaiting review.`}
        </p>
      </header>

      <OnboardingReviewTable submissions={pending} />
    </main>
  );
}
