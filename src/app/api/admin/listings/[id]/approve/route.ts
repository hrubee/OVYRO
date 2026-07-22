/**
 * POST /api/admin/listings/[id]/approve  (spec §7)
 *
 * Approve a pending listing: it goes live, gets a 90-day expiry, and the seller
 * is emailed. Admin-gated; non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { jsonError } from "../../_lib/http";
import { approveListing } from "../../_lib/moderation";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    const listing = await approveListing(actor, id);
    return NextResponse.json({ listing });
  } catch (error) {
    return jsonError(error);
  }
}
