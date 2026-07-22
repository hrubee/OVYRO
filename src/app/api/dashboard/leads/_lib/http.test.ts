import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { LeadTransitionError } from "@/lib/leads";
import { AuthorizationError } from "@/lib/auth/roles";
import { AuthenticationError } from "@/lib/auth/session";
import {
  BadRequestError,
  NotFoundError,
  errorResponse,
  mapErrorToResponse,
  ok,
} from "./http";

describe("ok", () => {
  test("wraps payload under `data` with the given status", async () => {
    const res = ok({ id: "abc" }, 201);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ data: { id: "abc" } });
  });

  test("defaults to 200", () => {
    expect(ok({}).status).toBe(200);
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
      .object({ status: z.enum(["new"]) })
      .safeParse({ status: "bogus" });
    expect(parsed.success).toBe(false);
    const res = mapErrorToResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("AuthenticationError → 401 UNAUTHORIZED (anonymous)", async () => {
    const res = mapErrorToResponse(new AuthenticationError());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  test("AuthorizationError → 403 FORBIDDEN (non-seller)", async () => {
    const res = mapErrorToResponse(new AuthorizationError());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  test("NotFoundError → 404 (ownership never disclosed)", async () => {
    const res = mapErrorToResponse(new NotFoundError("gone"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "gone" },
    });
  });

  test("BadRequestError → 400", () => {
    expect(mapErrorToResponse(new BadRequestError()).status).toBe(400);
  });

  test("LeadTransitionError from core → 409 INVALID_TRANSITION", async () => {
    const res = mapErrorToResponse(new LeadTransitionError("new", "won"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "INVALID_TRANSITION" },
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
