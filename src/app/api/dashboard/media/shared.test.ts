import { describe, expect, test } from "bun:test";
import { AuthorizationError } from "@/lib/auth/roles";
import {
  MAX_PHOTO_BYTES,
  MediaError,
  completeSchema,
  errorResponse,
  extForMime,
  isAllowedPhotoMime,
  mediaPrefix,
  originalKey,
  presignSchema,
  reorderSchema,
} from "./shared";

describe("mime validation", () => {
  test("accepts the allowed photo types and their aliases", () => {
    for (const mime of [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]) {
      expect(isAllowedPhotoMime(mime)).toBe(true);
    }
  });

  test("rejects video and arbitrary types", () => {
    for (const mime of ["video/mp4", "image/gif", "application/pdf", "image/svg+xml"]) {
      expect(isAllowedPhotoMime(mime)).toBe(false);
    }
  });

  test("maps mime to a storage extension", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("image/heif")).toBe("heic");
    expect(extForMime("image/png")).toBe("png");
  });
});

describe("key construction", () => {
  test("prefix and original key are listing/media scoped", () => {
    expect(mediaPrefix("L1", "M1")).toBe("listings/L1/M1");
    expect(originalKey("L1", "M1", "image/webp")).toBe("listings/L1/M1/original.webp");
  });
});

describe("presignSchema", () => {
  test("accepts a valid request", () => {
    const parsed = presignSchema.parse({
      listingId: "L1",
      filename: "field.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1_000_000,
    });
    expect(parsed.contentType).toBe("image/jpeg");
  });

  test("rejects an oversize file", () => {
    const result = presignSchema.safeParse({
      listingId: "L1",
      filename: "big.jpg",
      contentType: "image/jpeg",
      sizeBytes: MAX_PHOTO_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects a disallowed type", () => {
    const result = presignSchema.safeParse({
      listingId: "L1",
      filename: "clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 1_000,
    });
    expect(result.success).toBe(false);
  });
});

describe("completeSchema", () => {
  test("requires listing, media and storage key", () => {
    expect(completeSchema.safeParse({ listingId: "L1", mediaId: "M1" }).success).toBe(false);
    expect(
      completeSchema.safeParse({
        listingId: "L1",
        mediaId: "M1",
        storageKey: "listings/L1/M1/original.jpg",
      }).success,
    ).toBe(true);
  });
});

describe("reorderSchema", () => {
  test("accepts a unique ordered list", () => {
    expect(reorderSchema.safeParse({ listingId: "L1", order: ["a", "b", "c"] }).success).toBe(true);
  });

  test("rejects duplicate ids", () => {
    expect(reorderSchema.safeParse({ listingId: "L1", order: ["a", "a"] }).success).toBe(false);
  });

  test("rejects an empty order", () => {
    expect(reorderSchema.safeParse({ listingId: "L1", order: [] }).success).toBe(false);
  });
});

describe("errorResponse", () => {
  test("maps a ZodError to 422", async () => {
    const parsed = presignSchema.safeParse({});
    expect(parsed.success).toBe(false);
    const response = errorResponse(parsed.success ? new Error() : parsed.error);
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  test("maps a MediaError to its status and code", async () => {
    const response = errorResponse(new MediaError("too_many_photos", "Too many.", 409));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; message: string };
    expect(body).toEqual({ error: "too_many_photos", message: "Too many." });
  });

  test("maps an AuthorizationError to 403", async () => {
    const response = errorResponse(new AuthorizationError());
    expect(response.status).toBe(403);
  });

  test("maps an unknown error to 500", async () => {
    const response = errorResponse(new Error("boom"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("internal_error");
  });
});
