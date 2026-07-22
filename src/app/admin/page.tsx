/**
 * Admin overview dashboard (spec §4.1.1) — `/admin`.
 *
 * Server component: gated to admins, then reads every headline figure from the
 * analytics-core metric helpers via {@link ./_lib/overview}. Because those
 * helpers read the raw tables over the trailing window (including today's
 * partial day), the KPI cards reconcile with the underlying tables by
 * construction (spec §14). The 7/30/90-day selector is a URL search param, so
 * the whole page is server-rendered per period with no client fetching.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PERIOD_DAYS } from "@/lib/analytics";
import { isAdmin } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { FunnelPanel } from "./_components/funnel-panel";
import { KpiCard } from "./_components/kpi-card";
import { ListingStatusCard } from "./_components/listing-status-card";
import { MetaHealthCard } from "./_components/meta-health-card";
import { PeriodSelector } from "./_components/period-selector";
import { fmtCount, fmtRatio } from "./_lib/format";
import { loadAdminOverview, parsePeriodDays } from "./_lib/overview";

export const metadata: Metadata = { title: "Overview · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin");
  if (!isAdmin(actor.roles)) notFound();

  const { period } = await searchParams;
  const days = parsePeriodDays(period);
  const { users, activeBuyers, sellers, signups, listings, meta, leads, funnel } =
    await loadAdminOverview(days);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform KPIs for the trailing {days} days, versus the previous{" "}
            {days} days.{" "}
            <Link href="/admin/analytics" className="font-medium underline">
              View analytics
            </Link>
          </p>
        </div>
        <PeriodSelector options={PERIOD_DAYS} current={days} param="period" />
      </header>

      {/* People */}
      <section aria-labelledby="people-heading" className="mb-6">
        <h2 id="people-heading" className="sr-only">
          People
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Registered users" value={fmtCount(users.total)}>
            {fmtCount(users.buyersOnly)} buyers-only · {fmtCount(users.sellers)}{" "}
            sellers
          </KpiCard>
          <KpiCard
            label="Active buyers"
            value={fmtCount(activeBuyers.active)}
            caption={`of ${fmtCount(activeBuyers.registered)} registered`}
          />
          <KpiCard
            label="Sellers"
            value={fmtCount(sellers.sellers)}
            caption={`${fmtCount(sellers.activeSellers)} active (≥1 live listing)`}
          />
          <KpiCard
            label="New signups"
            value={fmtCount(signups.current.total)}
            trend={signups.trend}
          >
            {fmtCount(signups.current.buyers)} buyers ·{" "}
            {fmtCount(signups.current.sellers)} sellers
          </KpiCard>
        </div>
      </section>

      {/* Marketplace health */}
      <section aria-labelledby="market-heading" className="mb-6">
        <h2 id="market-heading" className="sr-only">
          Marketplace
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ListingStatusCard counts={listings} />
          <MetaHealthCard meta={meta} />
        </div>
      </section>

      {/* Leads + funnel */}
      <section aria-labelledby="leads-heading">
        <h2 id="leads-heading" className="sr-only">
          Leads and funnel
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <KpiCard
            label="Leads this period"
            value={fmtCount(leads.metric.current)}
            trend={leads.metric.trend}
          >
            Median {fmtCount(leads.median)} per listing ·{" "}
            {fmtRatio(leads.response.rate)} seller response rate
          </KpiCard>
          <FunnelPanel funnel={funnel.current} trend={funnel.trend} />
        </div>
      </section>
    </main>
  );
}
