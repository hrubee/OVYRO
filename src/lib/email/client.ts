import { Resend } from "resend";

let client: Resend | null = null;

/**
 * Returns a Resend client, or `null` when RESEND_API_KEY is unset.
 *
 * A null client is the signal to no-op rather than throw: local dev and the test
 * suite must never reach the network, and a missing key should not take down a
 * worker whose other processors are healthy.
 */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client ??= new Resend(apiKey);
  return client;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Verified sender for all transactional mail. */
export function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? "Ovyro <noreply@ovyro.com>";
}

/** Test seam — drops the memoized client so a changed API key is picked up. */
export function resetEmailClient(): void {
  client = null;
}
