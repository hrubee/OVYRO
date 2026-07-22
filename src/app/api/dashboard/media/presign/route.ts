/**
 * POST /api/dashboard/media/presign
 *
 * Seller-gated. Validates type/size against the listing the seller owns and the
 * per-listing photo cap, then returns a presigned R2 PUT URL so the browser
 * uploads the original straight to storage — bytes never pass through the web
 * process (CLAUDE.md: uploads direct-to-R2). No DB row is written yet; the row
 * is registered by `media/complete` once the upload lands.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { newId } from "@/lib/db";
import { getR2Client } from "@/lib/r2";
import {
  MAX_PHOTOS_PER_LISTING,
  MAX_PHOTO_BYTES,
  MediaError,
  countPhotos,
  errorResponse,
  isAllowedPhotoMime,
  loadOwnedListing,
  originalKey,
  presignSchema,
} from "../shared";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireActorWithRole("seller");
    const body = presignSchema.parse(await request.json());

    // Re-narrow after Zod (the refine validates but does not narrow the type).
    if (!isAllowedPhotoMime(body.contentType)) {
      throw new MediaError("wrong_type", "Unsupported image type.", 422);
    }

    await loadOwnedListing(actor.userId, body.listingId);

    if ((await countPhotos(body.listingId)) >= MAX_PHOTOS_PER_LISTING) {
      throw new MediaError(
        "too_many_photos",
        `A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos.`,
        409,
      );
    }

    const mediaId = newId();
    const storageKey = originalKey(body.listingId, mediaId, body.contentType);
    const presigned = await getR2Client().presignUpload({
      key: storageKey,
      contentType: body.contentType,
      maxSizeBytes: MAX_PHOTO_BYTES,
      expiresInSeconds: 600,
    });

    return NextResponse.json(
      {
        mediaId,
        storageKey,
        uploadUrl: presigned.url,
        expiresAt: presigned.expiresAt,
        method: "PUT",
        headers: { "Content-Type": body.contentType },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
