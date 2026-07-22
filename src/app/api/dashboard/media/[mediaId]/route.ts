/**
 * DELETE /api/dashboard/media/[mediaId]
 *
 * Seller-gated. Removes a media row the seller owns (ownership resolved via the
 * parent listing) and best-effort deletes the original plus every derived
 * variant under the media prefix in R2.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingMedia } from "@/lib/db/schema";
import { getR2Client } from "@/lib/r2";
import {
  MediaError,
  errorResponse,
  loadOwnedListing,
  mediaPrefix,
} from "../shared";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireActorWithRole("seller");
    const { mediaId } = await params;

    const [row] = await db
      .select({ id: listingMedia.id, listingId: listingMedia.listingId })
      .from(listingMedia)
      .where(eq(listingMedia.id, mediaId))
      .limit(1);
    if (!row) {
      throw new MediaError("not_found", "Media not found.", 404);
    }

    // Ownership is enforced through the parent listing.
    await loadOwnedListing(actor.userId, row.listingId);

    await db.delete(listingMedia).where(eq(listingMedia.id, mediaId));

    // Storage cleanup must not fail the request — the row is already gone.
    try {
      await getR2Client().deletePrefix(`${mediaPrefix(row.listingId, mediaId)}/`);
    } catch (cleanupError) {
      console.error("R2 cleanup failed for media", mediaId, cleanupError);
    }

    return NextResponse.json({ deleted: mediaId });
  } catch (error) {
    return errorResponse(error);
  }
}
