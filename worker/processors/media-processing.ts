/**
 * `media-processing` queue — post-upload image work (spec §4.3.1, §13 Phase 1).
 *
 * PHOTOS ONLY. `video-ingest` (Mux) lands in Phase 6; no producer enqueues it
 * yet, so it throws loudly if one ever does.
 *
 * For `image-variants` the processor:
 *   1. downloads the original from R2,
 *   2. generates responsive webp variants + a small thumb + a blurhash
 *      placeholder with `sharp`/`blurhash` (the pure core is `generateImageVariants`),
 *   3. writes the variants back to R2,
 *   4. flips the `listing_media` row to `ready` (or `failed`) with the resolved
 *      URLs, dimensions and blurhash.
 *
 * The image work runs off the request path so a slow decode never blocks the
 * seller's upload response.
 */
import type { Job } from "bullmq";
import { encode } from "blurhash";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/lib/db";
import { listingMedia } from "@/lib/db/schema";
import { parseJobPayload } from "@/lib/queue";
import { getR2Client } from "@/lib/r2";
import { logger } from "../logger";

/** Responsive ladder — a variant is emitted per width not exceeding the source. */
const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920] as const;
const THUMB_WIDTH = 400;
const WEBP_QUALITY = 80;
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;
/** Blurhash is a placeholder — a tiny raster is plenty and keeps encoding cheap. */
const BLURHASH_MAX_DIMENSION = 32;
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface GeneratedVariant {
  width: number;
  height: number;
  /** webp-encoded bytes. */
  buffer: Buffer;
}

export interface ImageVariants {
  /** Source dimensions after EXIF orientation is applied. */
  width: number;
  height: number;
  /** Responsive webp variants, ascending by width (largest last). */
  variants: GeneratedVariant[];
  /** Small webp thumbnail for cards and the dashboard grid. */
  thumb: GeneratedVariant;
  blurhash: string;
}

async function toWebp(input: Buffer, width: number): Promise<GeneratedVariant> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, buffer: data };
}

async function computeBlurhash(input: Buffer): Promise<string> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .raw()
    .ensureAlpha()
    .resize(BLURHASH_MAX_DIMENSION, BLURHASH_MAX_DIMENSION, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  return encode(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height,
    BLURHASH_COMPONENTS_X,
    BLURHASH_COMPONENTS_Y,
  );
}

/**
 * Pure image transform: original bytes in, webp variants + thumb + blurhash out.
 * No R2 or DB — unit-tested directly against a real image buffer.
 */
export async function generateImageVariants(input: Buffer): Promise<ImageVariants> {
  const metadata = await sharp(input, { failOn: "none" }).rotate().metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error("Image has no decodable dimensions.");
  }

  // Never upscale; a tiny source still yields one variant at its native width.
  const targetWidths: number[] = VARIANT_WIDTHS.filter((candidate) => candidate <= width);
  if (targetWidths.length === 0) targetWidths.push(width);

  const variants: GeneratedVariant[] = [];
  for (const target of targetWidths) {
    variants.push(await toWebp(input, target));
  }

  const thumb = await toWebp(input, Math.min(THUMB_WIDTH, width));
  const blurhash = await computeBlurhash(input);

  return { width, height, variants, thumb, blurhash };
}

export async function processMediaProcessing(job: Job): Promise<unknown> {
  if (job.name === "video-ingest") {
    // Video/Mux ingest lands in Phase 6 (spec §13); nothing enqueues it in v1.
    throw new Error("video-ingest is not implemented until Phase 6.");
  }
  if (job.name !== "image-variants") {
    throw new Error(`Unhandled job "${job.name}" on the media-processing queue.`);
  }

  const { mediaId, listingId, r2Key } = parseJobPayload(
    "media-processing",
    "image-variants",
    job.data,
  );

  const [row] = await db
    .select({ id: listingMedia.id })
    .from(listingMedia)
    .where(eq(listingMedia.id, mediaId))
    .limit(1);
  if (!row) {
    // The seller deleted the media before the worker got to it — drop the job.
    logger.warn("media row gone before processing", { jobId: job.id, mediaId });
    return { skipped: "missing-row" };
  }

  await db
    .update(listingMedia)
    .set({ processingStatus: "processing" })
    .where(eq(listingMedia.id, mediaId));

  try {
    const r2 = getR2Client();
    const original = await r2.getObject(r2Key);
    const result = await generateImageVariants(original);

    const prefix = `listings/${listingId}/${mediaId}`;
    let displayKey = "";
    for (const variant of result.variants) {
      const key = `${prefix}/w${variant.width}.webp`;
      await r2.putObject({
        key,
        body: variant.buffer,
        contentType: "image/webp",
        cacheControl: CACHE_CONTROL,
      });
      displayKey = key; // ascending widths -> the largest is the display image
    }

    const thumbKey = `${prefix}/thumb.webp`;
    await r2.putObject({
      key: thumbKey,
      body: result.thumb.buffer,
      contentType: "image/webp",
      cacheControl: CACHE_CONTROL,
    });

    await db
      .update(listingMedia)
      .set({
        processingStatus: "ready",
        url: r2.publicUrl(displayKey),
        thumbUrl: r2.publicUrl(thumbKey),
        blurhash: result.blurhash,
        width: result.width,
        height: result.height,
      })
      .where(eq(listingMedia.id, mediaId));

    logger.info("media processed", {
      jobId: job.id,
      mediaId,
      variants: result.variants.length,
    });
    return { mediaId, status: "ready", variants: result.variants.length };
  } catch (error) {
    // Mark failed but rethrow so BullMQ retries with backoff; a later attempt
    // flips it back to `processing` and, on success, to `ready`.
    await db
      .update(listingMedia)
      .set({ processingStatus: "failed" })
      .where(eq(listingMedia.id, mediaId))
      .catch(() => {});
    throw error;
  }
}
