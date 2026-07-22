/**
 * Seller lead inbox collection — `GET /api/dashboard/leads` (spec §4.3.2, §7).
 *
 * Returns every lead across the seller's listings (via the denormalized
 * `leads.seller_id`), newest first, narrowed by the optional `listingId`,
 * `status`, `from`, and `to` query filters. Seller-gated: anonymous → 401,
 * non-seller → 403. Leads are serialized through leads-core `serialize`, so the
 * server-internal Meta attribution fields never reach the browser.
 */
import type { NextRequest } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serialize } from "@/lib/leads";
import { handleRoute, ok } from "./_lib/http";
import { parseLeadFilters } from "./_lib/filters";
import { listSellerLeads } from "./_lib/repo";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");

    const filters = parseLeadFilters(req.nextUrl.searchParams);
    const rows = await listSellerLeads(db, actor.userId, filters);

    return ok(rows.map(serialize));
  });
}
