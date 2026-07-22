import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ListingTransitionError } from "@/lib/listings";
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
      .object({ title: z.string().min(3, "too short") })
      .safeParse({ title: "a" });
    expect(parsed.success).toBe(false);
    const res = mapErrorToResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("too short");
  });

  test("NotFoundError → 404", async () => {
    const res = mapErrorToResponse(new NotFoundError("gone"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "gone" },
    });
  });

  test("BadRequestError → 400", () => {
    expect(mapErrorToResponse(new BadRequestError()).status).toBe(400);
  });

  test("ListingTransitionError from core → 409 INVALID_TRANSITION", async () => {
    const res = mapErrorToResponse(new ListingTransitionError("draft", "active"));
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
