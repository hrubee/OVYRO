/**
 * Shared building blocks for the seller media routes (spec §4.3.1 media rules).
 *
 * The pure pieces here — allowed MIME set, size/count caps, request schemas,
 * key construction and error mapping — are unit-tested in `shared.test.ts`; the
 * route handlers stay thin wrappers around them plus DB/R2 IO.
 */
import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { AuthenticationError } from "@/lib/auth/session";
import { AuthorizationError } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { listingMedia, listings } from "@/lib/db/schema";

/** spec §4.3.1: 15 MB per photo, up to 25 photos per listing. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS_PER_LISTING = 25;

/**
 * Accepted upload types mapped to the extension used for the stored original.
 * `image/jpg` and `image/heif` are non-canonical aliases some browsers emit for
 * JPEG and HEIC respectively.
 */
export const ALLOWED_PHOTO_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
} as const;

export type AllowedPhotoMime = keyof typeof ALLOWED_PHOTO_MIME;

export function isAllowedPhotoMime(mime: string): mime is AllowedPhotoMime {
  return Object.prototype.hasOwnProperty.call(ALLOWED_PHOTO_MIME, mime);
}

export function extForMime(mime: AllowedPhotoMime): string {
  return ALLOWED_PHOTO_MIME[mime];
}

/** Storage key prefix owning a media item and every derived variant. */
export function mediaPrefix(listingId: string, mediaId: string): string {
  return `listings/${listingId}/${mediaId}`;
}

export function originalKey(
  listingId: string,
  mediaId: string,
  mime: AllowedPhotoMime,
): string {
  return `${mediaPrefix(listingId, mediaId)}/original.${extForMime(mime)}`;
}

// --- Request schemas ------------------------------------------------------

const photoMime = z
  .string()
  .refine(isAllowedPhotoMime, "Unsupported image type. Allowed: JPG, PNG, WebP, HEIC.");

export const presignSchema = z.object({
  listingId: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: photoMime,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_PHOTO_BYTES, "Photos must be 15 MB or smaller."),
});

export const completeSchema = z.object({
  listingId: z.string().min(1),
  mediaId: z.string().min(1),
  storageKey: z.string().min(1),
});

export const reorderSchema = z
  .object({
    listingId: z.string().min(1),
    order: z.array(z.string().min(1)).min(1).max(MAX_PHOTOS_PER_LISTING),
  })
  .refine(
    (value) => new Set(value.order).size === value.order.length,
    "Order must not repeat a media id.",
  );

// --- Domain errors --------------------------------------------------------

/** A media-route failure that maps cleanly onto an HTTP status. */
export class MediaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MediaError";
  }
}

/** Maps thrown errors onto JSON responses. Unknown errors become a 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof MediaError
  ) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  console.error("Unhandled media route error:", error);
  return NextResponse.json(
    { error: "internal_error", message: "Something went wrong." },
    { status: 500 },
  );
}

// --- Ownership + counting -------------------------------------------------

export interface OwnedListing {
  id: string;
  sellerId: string;
}

/**
 * Loads a listing the actor owns. Missing and not-owned both surface as 404 so
 * a seller cannot enumerate other sellers' listing ids (spec §3.2 guard rails).
 * Soft-deleted listings are treated as gone.
 */
export async function loadOwnedListing(
  actorUserId: string,
  listingId: string,
): Promise<OwnedListing> {
  const [row] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      deletedAt: listings.deletedAt,
    })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!row || row.deletedAt || row.sellerId !== actorUserId) {
    throw new MediaError("not_found", "Listing not found.", 404);
  }
  return { id: row.id, sellerId: row.sellerId };
}

/** Number of photo rows already attached to a listing. */
export async function countPhotos(
  listingId: string,
  tx: Pick<typeof db, "select"> = db,
): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(listingMedia)
    .where(and(eq(listingMedia.listingId, listingId), eq(listingMedia.kind, "photo")));
  return Number(row?.value ?? 0);
}
