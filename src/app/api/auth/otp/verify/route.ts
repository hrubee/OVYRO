/**
 * POST /api/auth/otp/verify
 *
 * Checks the submitted code against Twilio Verify (or the fixed dev code in DEV
 * MODE). On success it stamps `users.phone_verified_at` and records the verified
 * number on the signed-in user — the exact column the inquiry-submission flow
 * gates on (spec §4.2.2 contract). Requires a session.
 *
 * This static path takes precedence over the Better Auth `[...all]` catch-all.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { checkPhoneOtp } from "@/lib/auth/phone-otp";
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  OtpError,
  errorResponse,
  normalizePhone,
  verifyOtpSchema,
} from "../shared";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireActor();
    const { phone, code } = verifyOtpSchema.parse(await request.json());
    const normalized = normalizePhone(phone);

    const result = await checkPhoneOtp(normalized, code);
    if (!result.approved) {
      throw new OtpError(
        "invalid_code",
        "That code is incorrect or has expired.",
        400,
      );
    }

    const verifiedAt = new Date();
    await db
      .update(users)
      .set({ phone: normalized, phoneVerifiedAt: verifiedAt })
      .where(eq(users.id, actor.userId));

    return NextResponse.json({
      verified: true,
      phoneVerifiedAt: verifiedAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
