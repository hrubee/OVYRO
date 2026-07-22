/**
 * Cloudflare R2 media storage (spec §8.1, §4.3.1).
 *
 * R2 speaks the S3 API, so we drive it with the AWS SDK pointed at the R2
 * endpoint. Two access paths:
 *   - route handlers presign direct PUTs (`presignUpload`) so browser uploads go
 *     straight to storage — the web process never buffers file bytes (CLAUDE.md:
 *     "uploads direct-to-R2", Railway must not proxy large files);
 *   - the `media-processing` worker reads the original back (`getObject`),
 *     writes `sharp` variants (`putObject`), and derives public URLs.
 *
 * Credentials come from env (`R2_*`); nothing here is logged. The client is
 * memoized per process and reset in tests via `resetR2Client`.
 */
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
  /**
   * Enforced server-side so a client cannot presign an unbounded upload. A
   * presigned PUT cannot bind the body length by itself, so this is validated at
   * presign time (declared size) and re-verified from the stored object's real
   * size at `media/complete` via `headObject`.
   */
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

export interface R2ObjectHead {
  /** Real stored size in bytes. */
  contentLength: number;
  /** Content-Type recorded on the stored object, if any. */
  contentType: string | null;
}

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** e.g. immutable long-lived caching for content-addressed variants. */
  cacheControl?: string;
}

export interface R2Client {
  presignUpload(input: PresignUploadInput): Promise<PresignedUpload>;
  /** Download an object's bytes — used by the worker to read the original. */
  getObject(key: string): Promise<Buffer>;
  /** Upload bytes directly — used by the worker to write derived variants. */
  putObject(input: PutObjectInput): Promise<void>;
  /** Object metadata, or `null` when the key does not exist. */
  headObject(key: string): Promise<R2ObjectHead | null>;
  deleteObject(key: string): Promise<void>;
  /** Delete every object under a key prefix (a media item and its variants). */
  deletePrefix(prefix: string): Promise<void>;
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

/**
 * Public base URL for served media (the R2 bucket's public `r2.dev` URL or a
 * custom CDN domain). Separate from the S3 credentials because R2 does not
 * expose a deterministic public URL — it is whatever domain the bucket is
 * published on. Trailing slashes are trimmed so `publicUrl` can always join
 * with a single `/`.
 */
export function getR2PublicBaseUrl(): string {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) {
    throw new Error("R2_PUBLIC_BASE_URL is not set — needed to build public media URLs. See .env.example.");
  }
  return base.replace(/\/+$/, "");
}

/** R2 S3 endpoint for an account. */
function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

let client: { s3: S3Client; bucket: string } | null = null;

function s3(): { s3: S3Client; bucket: string } {
  if (client) return client;
  const config = getR2Config();
  client = {
    bucket: config.bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: r2Endpoint(config.accountId),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 supports path-style addressing, which sidesteps virtual-host DNS.
      forcePathStyle: true,
    }),
  };
  return client;
}

/** Test seam — drops the memoized client so changed R2 env is picked up. */
export function resetR2Client(): void {
  client = null;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err.name === "NotFound" ||
    err.name === "NoSuchKey" ||
    err.$metadata?.httpStatusCode === 404
  );
}

const realClient: R2Client = {
  async presignUpload(input) {
    const { s3: r2, bucket } = s3();
    const expiresIn = input.expiresInSeconds ?? 600;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
    });
    const url = await getSignedUrl(r2, command, { expiresIn });
    return {
      url,
      key: input.key,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  },

  async getObject(key) {
    const { s3: r2, bucket } = s3();
    const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) {
      throw new Error(`R2 object "${key}" has no body.`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  },

  async putObject(input) {
    const { s3: r2, bucket } = s3();
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      }),
    );
  },

  async headObject(key) {
    const { s3: r2, bucket } = s3();
    try {
      const response = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },

  async deleteObject(key) {
    const { s3: r2, bucket } = s3();
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  async deletePrefix(prefix) {
    const { s3: r2, bucket } = s3();
    let continuationToken: string | undefined;
    do {
      const listed = await r2.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));
      if (keys.length > 0) {
        await r2.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  },

  publicUrl(key) {
    return `${getR2PublicBaseUrl()}/${key}`;
  },
};

export function getR2Client(): R2Client {
  return realClient;
}
