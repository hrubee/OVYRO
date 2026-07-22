/**
 * Shared HTTP concerns for the admin settings routes (spec §4.1.6, §7).
 *
 * Same one-envelope contract as the other admin resources: every handler is a
 * thin `try { ... } catch (e) { return jsonError(e) }`. Domain errors carry a
 * string `code` and numeric `status`, so this matches on that shape.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Raised when a flag key is not in the known catalog. */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;

  constructor(message = "Not found.") {
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
  console.error("[admin/settings] unhandled route error", error);
  return errorResponse("INTERNAL", "Something went wrong.", 500);
}
