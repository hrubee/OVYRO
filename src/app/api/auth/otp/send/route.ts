/**
 * POST /api/auth/otp/send
 *
 * Starts phone verification for the signed-in user: rate-limited per phone and
 * per IP (spec §12), then Twilio Verify sends an SMS code — or DEV MODE logs a
 * fixed code when no creds are configured, so local flows work offline. Requires
 * a session: only an authenticated buyer verifies a phone, and we need their
 * user row to attribute the eventual `phone_verified_at` to. The code is never
 * returned to the caller.
 *
 * This static path takes precedence over the Better Auth `[...all]` catch-all.
 */
import { NextResponse } from "next/server";
import { sendPhoneOtp } from "@/lib/auth/phone-otp";
import { requireActor } from "@/lib/auth/session";
import { limit } from "@/lib/rate-limit";
import {
  OTP_SEND_MAX_PER_IP,
  OTP_SEND_MAX_PER_PHONE,
  OTP_SEND_WINDOW_SECONDS,
  OtpError,
  errorResponse,
  getClientIp,
  normalizePhone,
  otpSendIpKey,
  otpSendPhoneKey,
  sendOtpSchema,
} from "../shared";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireActor();
    const { phone } = sendOtpSchema.parse(await request.json());
    const normalized = normalizePhone(phone);
    const ip = getClientIp(request);

    // Fail open on a Redis outage: locking every user out of phone verification
    // is worse than the brief spam window, and Twilio Verify has its own fraud
    // guard. (Lead submission, by contrast, fails closed — spec §12.)
    const [byPhone, byIp] = await Promise.all([
      limit(
        otpSendPhoneKey(normalized),
        OTP_SEND_MAX_PER_PHONE,
        OTP_SEND_WINDOW_SECONDS,
        { failOpen: true },
      ),
      limit(otpSendIpKey(ip), OTP_SEND_MAX_PER_IP, OTP_SEND_WINDOW_SECONDS, {
        failOpen: true,
      }),
    ]);
    if (!byPhone.allowed || !byIp.allowed) {
      throw new OtpError(
        "rate_limited",
        "Too many code requests. Please wait a few minutes and try again.",
        429,
      );
    }

    const result = await sendPhoneOtp(normalized);
    if (!result.sent) {
      throw new OtpError(
        "send_failed",
        "Could not send a verification code. Please try again.",
        502,
      );
    }

    // `devMode` lets the UI hint the fixed dev code locally; it is always false
    // once Twilio creds are configured, so it leaks nothing in production.
    return NextResponse.json({ sent: true, devMode: result.skipped });
  } catch (error) {
    return errorResponse(error);
  }
}
