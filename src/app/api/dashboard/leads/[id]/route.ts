/**
 * A single seller lead — `GET` (read + stamp first-view) and `PATCH` (status).
 *
 * Both are seller-gated, and a lead that is not on one of the caller's listings
 * resolves to 404 (ownership is never disclosed as a 403 — task guard).
 *
 *   - `GET`  opens the lead: it stamps `seller_first_viewed_at` on the *first*
 *     read (idempotent) — the "seller viewed it" signal the admin funnel reads
 *     (spec §4.1.4) — and returns the lead.
 *   - `PATCH` moves the lead through the pipeline. The `from → to` move is gated
 *     by leads-core `assertTransition` (`new → contacted → negotiating → won`,
 *     with `lost` reachable from any live stage), so an illegal move is a 409
 *     via `LeadTransitionError` and the seller CRM can never skip or reopen.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { LEAD_STATUSES, assertTransition, serialize } from "@/lib/leads";
import { NotFoundError, handleRoute, ok, readJson } from "../_lib/http";
import { getSellerLead, markLeadFirstViewed, setLeadStatus } from "../_lib/repo";

const statusBody = z.object({ status: z.enum(LEAD_STATUSES) }).strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const { id } = await params;

    const row = await markLeadFirstViewed(db, actor.userId, id);
    if (!row) throw new NotFoundError("Lead not found.");

    return ok(serialize(row));
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const { id } = await params;
    const { status } = statusBody.parse(await readJson(req));

    const lead = await getSellerLead(db, actor.userId, id);
    if (!lead) throw new NotFoundError("Lead not found.");

    // Legality is the shared machine's call — illegal moves throw 409 here.
    assertTransition(lead.status, status);

    const updated = await setLeadStatus(db, actor.userId, id, status);
    if (!updated) throw new NotFoundError("Lead not found.");

    return ok(serialize(updated));
  });
}
