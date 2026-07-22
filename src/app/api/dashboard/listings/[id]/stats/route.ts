/**
 * Per-listing seller stats — `GET /api/dashboard/listings/[id]/stats`.
 *
 * Seller-gated. Totals come from the listing's denormalized counters
 * (`view_count` / `save_count` / `lead_count`); the 7- and 30-day sparkline
 * series come from `analytics_events`. Ownership is enforced by the shared
 * listings repo: a listing that is not the caller's live listing resolves to a
 * 404 (never a 403), so a seller cannot probe another seller's stats.
 *
 * Note the route segment: this nests under the *existing* `[id]` dynamic
 * segment (the dashboard listings convention), never a differently-named
 * sibling — two different slug names under one parent is a build-time collision
 * in Next.js App Router.
 */
import type { NextRequest } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError, handleRoute, ok } from "../../_lib/http";
import { getSellerListing } from "../../_lib/repo";
import { getListingEventBuckets, windowStart } from "./_lib/repo";
import { buildListingStatsResponse } from "./_lib/series";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const { id } = await params;

    const listing = await getSellerListing(db, actor.userId, id);
    if (!listing) throw new NotFoundError("Listing not found.");

    const now = new Date();
    const buckets = await getListingEventBuckets(
      db,
      listing.id,
      windowStart(now),
    );

    return ok(buildListingStatsResponse({ listing, buckets, now }));
  });
}
