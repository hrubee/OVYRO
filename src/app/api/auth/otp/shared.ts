/**
 * Shared building blocks for the phone-OTP routes (spec §4.2.2, §7).
 *
 * The pure pieces here — request schemas, phone normalisation, client-IP
 * extraction, rate-limit config/keys and error mapping — are unit-tested in
 * `shared.test.ts`; the send/verify handlers stay thin wrappers around these
 * plus Twilio + DB IO (mirroring the seller media routes' `shared.ts`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/roles";
import { AuthenticationError } from "@/lib/auth/session";
import { rateLimitKey } from "@/lib/rate-limit";

/**
 * Optional leading `+` then 7–15 digits — the same shape as the inquiry form's
 * `contactPhone` (src/lib/leads/schema.ts) so the OTP flow and the form can
 * never disagree on what counts as a valid number.
 */
const phoneField = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9]{7,15}$/,
    "Enter a valid phone number in international format.",
  );

/** OTP codes are numeric; Twilio Verify defaults to 6 digits — allow 4–10. */
const codeField = z
  .string()
  .trim()
  .regex(/^[0-9]{4,10}$/, "Enter the numeric code you received.");

export const sendOtpSchema = z.object({ phone: phoneField }).strict();
export const verifyOtpSchema = z
  .object({ phone: phoneField, code: codeField })
  .strict();

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * Normalise to E.164 for Twilio and for a stable rate-limit key: ensure a single
 * leading `+`. The Zod regex has already bounded the digits and stripped
 * surrounding whitespace, so this only has to fix the prefix.
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

// --- Rate-limit config (spec §12: throttle the auth send endpoint) --------

/** Per-phone send allowance: 5 codes per 15-minute window. */
export const OTP_SEND_MAX_PER_PHONE = 5;
/** Per-IP send allowance: wider, to catch a spray across many numbers. */
export const OTP_SEND_MAX_PER_IP = 20;
export const OTP_SEND_WINDOW_SECONDS = 15 * 60;

export const otpSendPhoneKey = (phone: string): string =>
  rateLimitKey("otp:send:phone", phone);
export const otpSendIpKey = (ip: string): string =>
  rateLimitKey("otp:send:ip", ip);

/**
 * Best-effort client IP from the proxy headers Railway sets. Falls back to a
 * sentinel so the per-IP limiter still groups otherwise-unattributable hits
 * rather than minting a fresh key each request.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// --- Domain errors --------------------------------------------------------

/** An OTP-route failure that maps cleanly onto an HTTP status. */
export class OtpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OtpError";
  }
}

/** Maps thrown errors onto JSON responses. Unknown errors become a 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof OtpError
  ) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  console.error("Unhandled OTP route error:", error);
  return NextResponse.json(
    { error: "internal_error", message: "Something went wrong." },
    { status: 500 },
  );
}
