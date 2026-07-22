/**
 * Shared HTTP concerns for the admin users routes (spec §4.1.2, §7).
 *
 * Same one-envelope contract as the other admin resources: every handler is a
 * thin `try { ... } catch (e) { return jsonError(e) }`. Domain errors carry a
 * string `code` and numeric `status` (`AuthenticationError` 401,
 * `AuthorizationError` 403, `NotFoundError` 404, `SelfActionError` 400), so this
 * matches on that shape rather than importing each class — keeping the auth
 * layer's heavy imports out of the unit-testable path.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Raised when a user id resolves to nothing. */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;

  constructor(message = "User not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface ErrorBody {
  error: { code: string; message: string };
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<ErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface EnvelopeError extends Error {
  code: string;
  status: number;
}

function isEnvelopeError(error: unknown): error is EnvelopeError {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  );
}

/** Map any thrown value to the standard error envelope + status. */
export function jsonError(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ZodError) {
    return errorResponse(
      "VALIDATION_ERROR",
      error.issues[0]?.message ?? "Invalid request.",
      400,
    );
  }
  if (isEnvelopeError(error)) {
    return errorResponse(error.code, error.message, error.status);
  }
  console.error("[admin/users] unhandled route error", error);
  return errorResponse("INTERNAL", "Something went wrong.", 500);
}
