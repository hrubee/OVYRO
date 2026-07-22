/**
 * Seller listing-stats page — `/dashboard/listings/[id]/stats`.
 *
 * Server-rendered from the same repo + builder the JSON API uses, so the page
 * and `GET .../stats` always agree. Seller-gated and ownership-scoped: a
 * listing that is not the caller's live listing is a 404 (`notFound`), never a
 * peek at someone else's numbers.
 *
 * Nests under the existing `[id]` dashboard segment (not a `[slug]` sibling) to
 * avoid a Next.js dynamic-segment collision.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSellerListing } from "@/app/api/dashboard/listings/_lib/repo";
import {
  getListingEventBuckets,
  windowStart,
} from "@/app/api/dashboard/listings/[id]/stats/_lib/repo";
import {
  buildListingStatsResponse,
  type StatMetricDTO,
  type StatMetricKey,
} from "@/app/api/dashboard/listings/[id]/stats/_lib/series";
import { StatMetricCard } from "@/components/dashboard/stats/stat-metric-card";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Listing stats" };

const METRICS: { key: StatMetricKey; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "saves", label: "Saves" },
  { key: "inquiries", label: "Inquiries" },
];

/** Map a metric's daily windows onto the card's plain props. */
function toWindows(metric: StatMetricDTO) {
  return [
    { label: "7 days", total: metric.last7, values: metric.daily7.map((p) => p.value) },
    {
      label: "30 days",
      total: metric.last30,
      values: metric.daily30.map((p) => p.value),
    },
  ];
}

export default async function ListingStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!isSeller(actor.roles)) redirect("/dashboard");

  const { id } = await params;
  const listing = await getSellerListing(db, actor.userId, id);
  if (!listing) notFound();

  const now = new Date();
  const buckets = await getListingEventBuckets(db, listing.id, windowStart(now));
  const { metrics } = buildListingStatsResponse({ listing, buckets, now });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/listings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Your listings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{listing.title}</h1>
        <p className="text-sm text-muted-foreground">
          Views, saves, and inquiries for this listing, with 7- and 30-day trends.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {METRICS.map(({ key, label }) => (
          <StatMetricCard
            key={key}
            label={label}
            total={metrics[key].total}
            windows={toWindows(metrics[key])}
          />
        ))}
      </div>
    </main>
  );
}
