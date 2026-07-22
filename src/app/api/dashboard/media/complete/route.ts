/**
 * POST /api/dashboard/media/complete
 *
 * Seller-gated. Called after the browser has PUT the original to R2. Verifies
 * the object actually landed and re-checks its real size/type from storage
 * (a presigned PUT cannot bind the body length), registers a `listing_media`
 * row in `uploading` state, and enqueues the `media-processing` job that
 * produces the webp variants + blurhash. Enqueue happens after the row commits.
 */
import { NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingMedia } from "@/lib/db/schema";
import { serializeMedia } from "@/lib/listings";
import { enqueue } from "@/lib/queue";
import { getR2Client } from "@/lib/r2";
import {
  MAX_PHOTOS_PER_LISTING,
  MAX_PHOTO_BYTES,
  MediaError,
  completeSchema,
  countPhotos,
  errorResponse,
  isAllowedPhotoMime,
  loadOwnedListing,
  mediaPrefix,
} from "../shared";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireActorWithRole("seller");
    const body = completeSchema.parse(await request.json());

    await loadOwnedListing(actor.userId, body.listingId);

    // The key must live under this listing+media prefix, so a caller cannot
    // register an object it uploaded against some other listing.
    const expectedPrefix = `${mediaPrefix(body.listingId, body.mediaId)}/`;
    if (!body.storageKey.startsWith(expectedPrefix)) {
      throw new MediaError("invalid_key", "Storage key does not match this listing media.", 400);
    }

    // Authoritative size/type check against what actually landed in storage.
    const head = await getR2Client().headObject(body.storageKey);
    if (!head) {
      throw new MediaError("object_missing", "No uploaded object found for this media.", 400);
    }
    if (head.contentLength > MAX_PHOTO_BYTES) {
      throw new MediaError("too_large", "Uploaded photo exceeds the 15 MB limit.", 422);
    }
    if (!head.contentType || !isAllowedPhotoMime(head.contentType)) {
      throw new MediaError("wrong_type", "Uploaded object is not an accepted image type.", 422);
    }

    const media = await db.transaction(async (tx) => {
      if ((await countPhotos(body.listingId, tx)) >= MAX_PHOTOS_PER_LISTING) {
        throw new MediaError(
          "too_many_photos",
          `A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos.`,
          409,
        );
      }

      const [{ maxSort } = { maxSort: null }] = await tx
        .select({ maxSort: max(listingMedia.sortOrder) })
        .from(listingMedia)
        .where(eq(listingMedia.listingId, body.listingId));
      const sortOrder = maxSort === null ? 0 : maxSort + 1;

      const [inserted] = await tx
        .insert(listingMedia)
        .values({
          id: body.mediaId,
          listingId: body.listingId,
          kind: "photo",
          storageKey: body.storageKey,
          processingStatus: "uploading",
          sortOrder,
          bytes: head.contentLength,
        })
        .onConflictDoNothing()
        .returning();
      return inserted;
    });

    if (!media) {
      throw new MediaError("already_registered", "This media is already registered.", 409);
    }

    await enqueue("media-processing", "image-variants", {
      mediaId: media.id,
      listingId: body.listingId,
      r2Key: body.storageKey,
    });

    return NextResponse.json(serializeMedia(media), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
