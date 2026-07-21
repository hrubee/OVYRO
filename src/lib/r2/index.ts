/**
 * Cloudflare R2 media storage — interface only.
 *
 * Phase 1 supplies the implementation (presigned PUTs via the S3-compatible API
 * and `sharp` variants generated in the `media-processing` queue). This stub
 * exists so the queue payloads and worker processors can be typed against the
 * final shape without pulling the AWS SDK into the tree yet.
 */

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface PresignUploadInput {
  /** Object key, e.g. `listings/<listingId>/<mediaId>/original.jpg`. */
  key: string;
  contentType: string;
  /** Enforced server-side so a client cannot presign an unbounded upload. */
  maxSizeBytes: number;
  expiresInSeconds?: number;
}

export interface PresignedUpload {
  url: string;
  key: string;
  expiresAt: string;
  /** Form fields to replay with the upload, when the presign strategy needs them. */
  fields?: Record<string, string>;
}

export interface R2Client {
  presignUpload(input: PresignUploadInput): Promise<PresignedUpload>;
  deleteObject(key: string): Promise<void>;
  /** Public CDN URL for an object, used in listing pages and OG tags. */
  publicUrl(key: string): string;
}

export function getR2Config(): R2Config {
  const config: R2Config = {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`R2 is not configured — missing: ${missing.join(", ")}. See .env.example.`);
  }

  return config;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

export function getR2Client(): R2Client {
  throw new Error("R2 client is not implemented yet — lands in Phase 1 (spec §13).");
}
