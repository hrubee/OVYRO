import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/roles";
import { OnboardingTransitionError } from "@/lib/onboarding";
import { NotFoundError, errorResponse, jsonError } from "./http";

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
  test("403 for a non-admin actor", async () => {
    const response = jsonError(new AuthorizationError());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  test("409 for an illegal onboarding transition", async () => {
    const response = jsonError(
      new OnboardingTransitionError("approved", "approved"),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
  });

  test("404 for a missing application", async () => {
    const response = jsonError(new NotFoundError("Seller application not found."));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "Seller application not found." },
    });
  });

  test("maps any error carrying code + status (e.g. a 401)", async () => {
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

  test("400 with the first issue message for a Zod error", async () => {
    const parsed = z
      .object({ note: z.string().min(1, "required") })
      .safeParse({ note: "" });
    expect(parsed.success).toBe(false);
    const response = jsonError(
      parsed.success ? new Error("unreachable") : parsed.error,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "VALIDATION_ERROR", message: "required" },
    });
  });

  test("500 without leaking internals for an unknown error", async () => {
    const response = jsonError(new Error("connection string exposed"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INTERNAL", message: "Something went wrong." },
    });
  });
});
