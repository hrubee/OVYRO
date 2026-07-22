import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  CaptchaError,
  NotFoundError,
  PhoneNotVerifiedError,
  RateLimitedError,
  SelfInquiryError,
  SpamRejectedError,
  errorResponse,
  jsonError,
} from "./http";

describe("errorResponse", () => {
  test("wraps code + message in the spec §7 envelope", async () => {
    const response = errorResponse("TEAPOT", "I'm a teapot.", 418);
    expect(response.status).toBe(418);
    await expect(response.json()).resolves.toEqual({
      error: { code: "TEAPOT", message: "I'm a teapot." },
    });
  });
});

describe("jsonError", () => {
  test("401 for any error carrying code + status (e.g. the auth guard)", async () => {
    class UnauthorizedError extends Error {
      readonly code = "UNAUTHORIZED";
      readonly status = 401;
    }
    const response = jsonError(new UnauthorizedError("Sign in first."));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED", message: "Sign in first." },
    });
  });

  test("403 for a self-inquiry", async () => {
    const response = jsonError(new SelfInquiryError());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SELF_INQUIRY" },
    });
  });

  test("403 for an unverified phone", async () => {
    const response = jsonError(new PhoneNotVerifiedError());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PHONE_NOT_VERIFIED" },
    });
  });

  test("404 for a missing listing", async () => {
    const response = jsonError(new NotFoundError());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  test("400 for a failed captcha", async () => {
    const response = jsonError(new CaptchaError());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CAPTCHA_FAILED" },
    });
  });

  test("400 for a tripped honeypot", async () => {
    const response = jsonError(new SpamRejectedError());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SPAM_DETECTED" },
    });
  });

  test("429 with a Retry-After header for a rate limit", async () => {
    const response = jsonError(new RateLimitedError("slow down", 120));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED", message: "slow down" },
    });
  });

  test("400 with the first issue message for a Zod error", async () => {
    const parsed = z
      .object({ contactName: z.string().min(1, "required") })
      .safeParse({ contactName: "" });
    const response = jsonError(
      parsed.success ? new Error("unreachable") : parsed.error,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "VALIDATION_ERROR", message: "required" },
    });
  });

  test("500 without leaking internals for an unknown error", async () => {
    const response = jsonError(new Error("db password leaked"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INTERNAL", message: "Something went wrong." },
    });
  });
});
