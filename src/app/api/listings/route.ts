import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseListingSearch, searchPublicListings } from "@/lib/search";

/**
 * GET /api/listings — public browse feed (spec §7).
 *
 * Filters (location text, region, price/area range, land type, road access,
 * utilities), sort, and forward keyset cursor pagination all come off the query
 * string. Parsing is lenient (`parseListingSearch`), so bad params degrade to a
 * sane page rather than a 400. Only active, non-deleted listings are returned.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = parseListingSearch(request.nextUrl.searchParams);
  const result = await searchPublicListings(db, params);
  return NextResponse.json(result);
}
