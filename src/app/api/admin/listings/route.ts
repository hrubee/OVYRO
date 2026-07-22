/**
 * GET /api/admin/listings?status=pending_review  (spec §7)
 *
 * The moderation queue. Admin-gated; defaults to `pending_review` (the primary
 * moderation job) and accepts any listing status for filtering.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActorWithRole } from "@/lib/auth/session";
import { LISTING_STATUSES } from "@/lib/listings";
import { jsonError } from "./_lib/http";
import { listModerationListings } from "./_lib/queries";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(LISTING_STATUSES);

export async function GET(request: NextRequest) {
  try {
    await requireActorWithRole("admin");

    const raw = request.nextUrl.searchParams.get("status");
    const status = raw === null ? undefined : statusSchema.parse(raw);

    const listings = await listModerationListings({ status });
    return NextResponse.json({ listings });
  } catch (error) {
    return jsonError(error);
  }
}
