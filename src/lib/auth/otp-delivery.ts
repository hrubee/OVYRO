export type OtpPurpose =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

const SUBJECTS: Record<OtpPurpose, string> = {
  "sign-in": "Your Ovyro sign-in code",
  "email-verification": "Verify your Ovyro email",
  "forget-password": "Reset your Ovyro password",
  "change-email": "Confirm your new Ovyro email",
};

/**
 * Delivery seam for email OTP codes.
 *
 * Transactional email runs on the worker (Resend + BullMQ, spec §8) which is
 * owned by a separate service and not wired up yet. Until then this logs the
 * code so local auth flows are usable end to end; the code itself is never
 * logged outside development, so a misconfigured production deploy fails
 * closed and silent rather than leaking a live credential to the log drain.
 */
export async function sendOtpEmail(input: {
  email: string;
  otp: string;
  type: OtpPurpose;
}): Promise<void> {
  const subject = SUBJECTS[input.type];

  if (process.env.NODE_ENV === "production") {
    // TODO(phase-1): enqueue on the `email` queue once the worker service lands.
    console.warn(
      `[auth] OTP requested for ${input.email} ("${subject}") but no email transport is wired up yet.`,
    );
    return;
  }

  console.info(`[auth] ${subject} → ${input.email}: ${input.otp}`);
}
