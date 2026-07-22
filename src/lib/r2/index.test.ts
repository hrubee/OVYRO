import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getR2Client,
  getR2Config,
  getR2PublicBaseUrl,
  isR2Configured,
  resetR2Client,
} from "./index";

const R2_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

const saved: Record<string, string | undefined> = {};

function setR2Env() {
  process.env.R2_ACCOUNT_ID = "acct123";
  process.env.R2_ACCESS_KEY_ID = "AKIAEXAMPLE";
  process.env.R2_SECRET_ACCESS_KEY = "secretExampleKey";
  process.env.R2_BUCKET = "ovyro-media";
  process.env.R2_PUBLIC_BASE_URL = "https://cdn.ovyro.test";
  resetR2Client();
}

beforeEach(() => {
  for (const key of R2_ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of R2_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetR2Client();
});

describe("getR2Config", () => {
  test("throws listing every missing variable", () => {
    for (const key of R2_ENV_KEYS) delete process.env[key];
    expect(() => getR2Config()).toThrow(/missing:.*accountId/);
  });

  test("returns config when fully set", () => {
    setR2Env();
    expect(getR2Config()).toEqual({
      accountId: "acct123",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secretExampleKey",
      bucket: "ovyro-media",
    });
  });
});

describe("isR2Configured", () => {
  test("false when credentials are absent", () => {
    for (const key of R2_ENV_KEYS) delete process.env[key];
    expect(isR2Configured()).toBe(false);
  });

  test("true once credentials are present", () => {
    setR2Env();
    expect(isR2Configured()).toBe(true);
  });
});

describe("getR2PublicBaseUrl", () => {
  test("trims trailing slashes", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://cdn.ovyro.test/";
    expect(getR2PublicBaseUrl()).toBe("https://cdn.ovyro.test");
  });

  test("throws when unset", () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    expect(() => getR2PublicBaseUrl()).toThrow(/R2_PUBLIC_BASE_URL/);
  });
});

describe("publicUrl", () => {
  test("joins base and key with a single slash", () => {
    setR2Env();
    expect(getR2Client().publicUrl("listings/l1/m1/thumb.webp")).toBe(
      "https://cdn.ovyro.test/listings/l1/m1/thumb.webp",
    );
  });
});

describe("presignUpload", () => {
  test("signs a PUT URL for the object key without touching the network", async () => {
    setR2Env();
    const before = Date.now();
    const presigned = await getR2Client().presignUpload({
      key: "listings/l1/m1/original.jpg",
      contentType: "image/jpeg",
      maxSizeBytes: 15 * 1024 * 1024,
      expiresInSeconds: 600,
    });

    expect(presigned.key).toBe("listings/l1/m1/original.jpg");
    const url = new URL(presigned.url);
    expect(url.hostname).toBe("acct123.r2.cloudflarestorage.com");
    expect(url.pathname).toContain("listings/l1/m1/original.jpg");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");

    const expiresAt = Date.parse(presigned.expiresAt);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 600 * 1000);
  });
});
