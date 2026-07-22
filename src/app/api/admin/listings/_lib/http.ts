/**
 * Shared HTTP concerns for the admin listings routes.
 *
 * One error envelope (`{ error: { code, message } }`, spec §7) and one mapper so
 * every handler is a thin `try { ... } catch (e) { return jsonError(e) }`.
 *
 * The domain errors this maps — `AuthenticationError` (401), `AuthorizationError`
 * (403), `ListingTransitionError` (409), `NotFoundError` (404) — all carry a
 * string `code` and numeric `status`, so `jsonError` matches on that shape
 * rather than importing each class. That also keeps this module free of the auth
 * layer's heavy imports (Better Auth) so it stays cheap to unit-test.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Raised by the service layer when a listing id resolves to nothing. */
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

/** An Error that already carries the API envelope's `code` + HTTP `status`. */
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
  // Nothing recognizable — never leak internals, but keep a server-side trace.
  console.error("[admin/listings] unhandled route error", error);
  return errorResponse("INTERNAL", "Something went wrong.", 500);
}
