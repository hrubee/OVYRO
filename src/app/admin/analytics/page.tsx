/**
 * Admin analytics dashboard (spec §4.1.5) — `/admin/analytics`.
 *
 * The overview (§4.1.1) answers "where are we now"; this page answers "how did
 * we get here" with the deeper time series. Server component, gated to admins
 * (same pattern as the overview), it reads every panel through
 * {@link ./_lib/load} — rollup-defined counts from `metrics_daily`, the rest
 * raw — and renders them with the dependency-free SVG/CSS chart components. The
 * 7/30/90-day window is a URL search param, so the whole page is server-rendered
 * per period with no client fetching (the selector shares the overview's).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LineChart } from "@/components/admin/charts/line-chart";
import { BarColumnChart } from "@/components/admin/charts/bar-column-chart";
import { HorizontalBars } from "@/components/admin/charts/horizontal-bars";
import { PERIOD_DAYS } from "@/lib/analytics";
import { isAdmin } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { PeriodSelector } from "../_components/period-selector";
import { fmtCount } from "../_lib/format";
import { parsePeriodDays } from "../_lib/overview";
import { ChartCard, SeriesLegend } from "./_components/chart-card";
import { loadAnalytics } from "./_lib/load";

export const metadata: Metadata = { title: "Analytics · Admin" };
export const dynamic = "force-dynamic";

/** Buyer/seller series colours for the neutral theme (lightness, not hue). */
const BUYER_COLOR = "text-primary";
const SELLER_COLOR = "text-muted-foreground";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin/analytics");
  if (!isAdmin(actor.roles)) notFound();

  const { period } = await searchParams;
  const days = parsePeriodDays(period);
  const data = await loadAnalytics(days);
  const { dayKeys } = data;

  const metaTotal = data.metaAdoption.cumulative.at(-1) ?? data.metaAdoption.base;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform trends over the trailing {days} days.{" "}
            <Link href="/admin" className="font-medium underline">
              Back to overview
            </Link>
          </p>
        </div>
        <PeriodSelector options={PERIOD_DAYS} current={days} param="period" />
      </header>

      {/* Growth time series */}
      <section aria-labelledby="growth-heading" className="mb-6">
        <h2 id="growth-heading" className="sr-only">
          Growth
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Signups over time"
            total={fmtCount(data.signups.totalCount)}
            caption="New accounts per day, by role"
            aside={
              <SeriesLegend
                items={[
                  { label: "Buyers", colorClass: BUYER_COLOR },
                  { label: "Sellers", colorClass: SELLER_COLOR },
                ]}
              />
            }
          >
            <LineChart
              ariaLabel="Signups per day, split by buyer and seller role"
              dayKeys={dayKeys}
              series={[
                { label: "Buyers", values: data.signups.buyers, colorClass: BUYER_COLOR },
                { label: "Sellers", values: data.signups.sellers, colorClass: SELLER_COLOR },
              ]}
            />
          </ChartCard>

          <ChartCard
            title="Listings created over time"
            total={fmtCount(data.listingsCreated.total)}
            caption="New listings per day"
          >
            <LineChart
              ariaLabel="Listings created per day"
              dayKeys={dayKeys}
              area
              series={[{ label: "Listings", values: data.listingsCreated.values }]}
            />
          </ChartCard>
        </div>
      </section>

      {/* Demand time series */}
      <section aria-labelledby="demand-heading" className="mb-6">
        <h2 id="demand-heading" className="sr-only">
          Demand
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Leads over time"
            total={fmtCount(data.leads.total)}
            caption="Inquiries submitted per day"
          >
            <BarColumnChart
              ariaLabel="Leads submitted per day"
              dayKeys={dayKeys}
              values={data.leads.values}
            />
          </ChartCard>

          <ChartCard
            title="Page views over time"
            total={fmtCount(data.pageViews.total)}
            caption="Listing landing-page views per day"
          >
            <LineChart
              ariaLabel="Listing page views per day"
              dayKeys={dayKeys}
              area
              series={[{ label: "Page views", values: data.pageViews.values }]}
            />
          </ChartCard>
        </div>
      </section>

      {/* Seller Meta adoption */}
      <section aria-labelledby="meta-heading" className="mb-6">
        <h2 id="meta-heading" className="sr-only">
          Meta adoption
        </h2>
        <ChartCard
          title="Seller Meta-connection adoption"
          total={fmtCount(metaTotal)}
          caption={`Cumulative active connections · +${fmtCount(
            data.metaAdoption.added,
          )} this period`}
        >
          <LineChart
            ariaLabel="Cumulative active seller Meta connections over time"
            dayKeys={dayKeys}
            area
            series={[
              { label: "Connections", values: data.metaAdoption.cumulative },
            ]}
          />
        </ChartCard>
      </section>

      {/* Categorical breakdowns */}
      <section aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading" className="sr-only">
          Breakdowns
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Top listings by leads"
            caption={`Most inquiries in the last ${days} days`}
          >
            <HorizontalBars
              items={data.topListings}
              emptyLabel="No leads in this period yet."
            />
          </ChartCard>

          <ChartCard
            title="Geographic distribution"
            caption="Live listings by region"
          >
            <HorizontalBars
              items={data.regions}
              emptyLabel="No listings to break down yet."
            />
          </ChartCard>
        </div>
      </section>
    </main>
  );
}
