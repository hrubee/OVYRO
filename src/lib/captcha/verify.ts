/**
 * Server-side CAPTCHA verification (Cloudflare Turnstile) for lead submission
 * (spec §12).
 *
 * Env-guarded like the email (Resend) and phone-OTP (Twilio) helpers: with no
 * `TURNSTILE_SECRET_KEY` configured this no-ops to a pass, so local dev and the
 * test suite never reach the network. With a secret set it POSTs the token to
 * Cloudflare's siteverify endpoint and reports the outcome.
 *
 * The matching public site key (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) belongs to the
 * client widget the wave-2 inquiry form renders; this module only ever touches
 * the secret and never logs it.
 */
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface CaptchaResult {
  /** True when the token is valid, or when verification was skipped (no secret). */
  success: boolean;
  /** True when no secret is configured and the check was skipped (dev/test). */
  skipped: boolean;
  /** Cloudflare (or synthetic) error codes when `success` is false. */
  errorCodes: string[];
}

/** The minimal `fetch` surface used here — lets tests inject a stub. */
export interface CaptchaFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type CaptchaFetch = (
  url: string,
  init: {
    method: string;
    body: URLSearchParams;
    headers?: Record<string, string>;
  },
) => Promise<CaptchaFetchResponse>;

export interface VerifyCaptchaOptions {
  /** The end-user IP, forwarded to Cloudflare as `remoteip` when present. */
  remoteIp?: string;
  /** Override `fetch` — the tests inject a stub here. */
  fetchImpl?: CaptchaFetch;
}

/** The Turnstile secret, or `undefined` when unset/blank. */
export function getTurnstileSecret(): string | undefined {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  return secret && secret.trim() !== "" ? secret : undefined;
}

export function isCaptchaConfigured(): boolean {
  return getTurnstileSecret() !== undefined;
}

/**
 * Verify a Turnstile token. Returns `{ success: true, skipped: true }` when no
 * secret is configured; otherwise verifies against Cloudflare. Any network or
 * parse failure fails **closed** (`success: false`) — the CAPTCHA guards lead
 * submission, so an unverifiable token must not pass.
 */
export async function verifyCaptcha(
  token: string,
  options: VerifyCaptchaOptions = {},
): Promise<CaptchaResult> {
  const secret = getTurnstileSecret();
  if (!secret) {
    return { success: true, skipped: true, errorCodes: [] };
  }

  if (!token || token.trim() === "") {
    return { success: false, skipped: false, errorCodes: ["missing-input-response"] };
  }

  const fetchImpl =
    options.fetchImpl ?? (globalThis.fetch as unknown as CaptchaFetch);

  const body = new URLSearchParams({ secret, response: token });
  if (options.remoteIp) {
    body.set("remoteip", options.remoteIp);
  }

  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    if (!res.ok) {
      return { success: false, skipped: false, errorCodes: [`http-${res.status}`] };
    }

    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    return {
      success: data.success === true,
      skipped: false,
      errorCodes: data["error-codes"] ?? [],
    };
  } catch {
    return { success: false, skipped: false, errorCodes: ["internal-error"] };
  }
}
