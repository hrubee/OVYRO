/**
 * HTTP concerns for the inquiry (lead-creation) route (spec §7).
 *
 * One error envelope (`{ error: { code, message } }`) and one mapper, so the
 * handler stays a thin `try { ... } catch (e) { return jsonError(e) }`. The
 * domain errors below each carry a string `code` + numeric `status`; `jsonError`
 * matches on that shape (like the admin/dashboard route helpers) rather than
 * importing every class, keeping this module free of heavy auth imports.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** No active, non-deleted listing owns the id — nothing to inquire on. */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;
  constructor(message = "Listing not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A seller cannot inquire on their own listing (spec §3.1, §4.2.2). */
export class SelfInquiryError extends Error {
  readonly code = "SELF_INQUIRY";
  readonly status = 403;
  constructor(message = "You can't inquire on your own listing.") {
    super(message);
    this.name = "SelfInquiryError";
  }
}

/** The caller's phone is not verified — the OTP wall must clear first (spec §4.2.2). */
export class PhoneNotVerifiedError extends Error {
  readonly code = "PHONE_NOT_VERIFIED";
  readonly status = 403;
  constructor(message = "Verify your phone number before sending an inquiry.") {
    super(message);
    this.name = "PhoneNotVerifiedError";
  }
}

/** A rate-limit window is exhausted (spec §12). Carries the retry hint. */
export class RateLimitedError extends Error {
  readonly code = "RATE_LIMITED";
  readonly status = 429;
  constructor(
    message = "You're sending inquiries too quickly. Try again later.",
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "RateLimitedError";
  }
}

/** CAPTCHA verification failed (spec §12). */
export class CaptchaError extends Error {
  readonly code = "CAPTCHA_FAILED";
  readonly status = 400;
  constructor(message = "Captcha verification failed. Please try again.") {
    super(message);
    this.name = "CaptchaError";
  }
}

/** The honeypot was filled — a bot. Reported as a generic validation error. */
export class SpamRejectedError extends Error {
  readonly code = "SPAM_DETECTED";
  readonly status = 400;
  constructor(message = "Unable to submit your inquiry.") {
    super(message);
    this.name = "SpamRejectedError";
  }
}

export interface ErrorBody {
  error: { code: string; message: string };
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse<ErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status, headers });
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
  if (error instanceof RateLimitedError) {
    const headers = error.retryAfterSeconds
      ? { "Retry-After": String(error.retryAfterSeconds) }
      : undefined;
    return errorResponse(error.code, error.message, error.status, headers);
  }
  if (isEnvelopeError(error)) {
    return errorResponse(error.code, error.message, error.status);
  }
  // Nothing recognizable — never leak internals, but keep a server-side trace.
  console.error("[listings/leads] unhandled route error", error);
  return errorResponse("INTERNAL", "Something went wrong.", 500);
}
