/**
 * POST /api/admin/listings/[id]/reject  (spec §7)
 *
 * Reject a pending listing with a reason (emailed to the seller). Body:
 * `{ "reason": string }`. Admin-gated; non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { jsonError } from "../../_lib/http";
import { rejectInputSchema, rejectListing } from "../../_lib/moderation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    // Tolerate an empty/invalid body: schema.parse then surfaces a 400, not a 500.
    const raw = await request.json().catch(() => ({}));
    const { reason } = rejectInputSchema.parse(raw);
    const listing = await rejectListing(actor, id, reason);
    return NextResponse.json({ listing });
  } catch (error) {
    return jsonError(error);
  }
}
