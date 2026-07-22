import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPublicListingDetail } from "@/lib/search";

/**
 * GET /api/listings/[slug] — public listing detail (spec §7).
 *
 * Returns the same public-safe payload the landing page renders from, or 404
 * when no active, non-deleted listing owns the slug. This GET is safe/idempotent
 * and deliberately does not touch `view_count` — the landing page owns view
 * counting so an API fetch never inflates it.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const listing = await getPublicListingDetail(db, slug);
  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(listing);
}
