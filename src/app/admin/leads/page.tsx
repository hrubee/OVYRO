/**
 * Admin leads — platform-wide, READ-ONLY (spec §4.1.4) — `/admin/leads`.
 *
 * Server component: gated to admins, resolves the search/status query params,
 * and renders every lead on the platform for dispute resolution. There is no
 * client component and no mutation path here on purpose — status is managed by
 * the seller in their own inbox, never from this admin view.
 *
 * Filtering uses a plain GET form so the whole surface stays server-rendered.
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads";
import { listAllLeads } from "@/app/api/admin/leads/_lib/queries";
import { LeadsTable } from "./_components/leads-table";

export const metadata: Metadata = { title: "Leads · Admin" };
export const dynamic = "force-dynamic";

function parseStatus(value: string | undefined): LeadStatus | undefined {
  return value && (LEAD_STATUSES as readonly string[]).includes(value)
    ? (value as LeadStatus)
    : undefined;
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin/leads");
  if (!isAdmin(actor.roles)) notFound();

  const { q, status } = await searchParams;
  const filters = { q: q?.trim() || undefined, status: parseStatus(status) };
  const leads = await listAllLeads(filters);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every inquiry across the platform, for dispute resolution. Read-only —
          delivery and seller-viewed status are shown to settle “I never received
          it” disputes.
        </p>
      </header>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-center gap-3"
        action="/admin/leads"
      >
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search listing or buyer/seller email…"
          aria-label="Search leads"
          className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          aria-label="Filter by status"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          Search
        </button>
      </form>

      <p className="mb-3 text-sm text-muted-foreground">
        {leads.length === 0
          ? "No leads found."
          : `Showing ${leads.length} lead${leads.length === 1 ? "" : "s"}.`}
      </p>

      <LeadsTable leads={leads} />
    </main>
  );
}
