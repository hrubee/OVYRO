import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/roles";
import { AuthenticationError } from "@/lib/auth/session";
import {
  BadRequestError,
  errorResponse,
  mapErrorToResponse,
  ok,
} from "./http";

describe("ok", () => {
  test("wraps payload under `data` with the given status", async () => {
    const res = ok({ pixelId: "123456789012" }, 200);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { pixelId: "123456789012" },
    });
  });
});

describe("errorResponse", () => {
  test("emits the { error: { code, message } } envelope", async () => {
    const res = errorResponse("NOPE", "no", 418);
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({
      error: { code: "NOPE", message: "no" },
    });
  });
});

describe("mapErrorToResponse", () => {
  test("ZodError → 400 VALIDATION_ERROR with the first issue message", async () => {
    const parsed = z
      .object({ pixelId: z.string().min(1, "required") })
      .safeParse({ pixelId: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const res = mapErrorToResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("required");
  });

  test("AuthenticationError → 401 UNAUTHORIZED", async () => {
    const res = mapErrorToResponse(new AuthenticationError());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  test("AuthorizationError → 403 FORBIDDEN (signed-in non-seller)", async () => {
    const res = mapErrorToResponse(new AuthorizationError());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  test("BadRequestError → 400 BAD_REQUEST", async () => {
    const res = mapErrorToResponse(new BadRequestError());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
  });

  test("unknown error → 500 INTERNAL_ERROR without leaking details", async () => {
    const res = mapErrorToResponse(new Error("secret db string"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("secret");
  });
});
