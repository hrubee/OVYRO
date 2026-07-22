/**
 * Phone OTP verification via Twilio Verify (spec §4.2.2, §7).
 *
 * Env-guarded exactly like the CAPTCHA (Cloudflare) and email (Resend) helpers:
 * with no `TWILIO_*` credentials configured this runs in DEV MODE — it accepts a
 * single fixed dev code, logs it, and never touches the network — so local dev
 * and the test suite work without a Twilio account. With credentials set it
 * drives Twilio Verify's REST API directly (no SDK dependency, matching the
 * `fetch`-against-Cloudflare approach in `src/lib/captcha`): one POST starts a
 * verification, one POST checks the submitted code.
 *
 * The Twilio auth token is a live secret and is never logged (CLAUDE.md).
 */
const TWILIO_VERIFY_BASE = "https://verify.twilio.com/v2/Services";

/**
 * The code DEV MODE accepts. Fixed and public on purpose — it only ever works
 * when no Twilio credentials are configured, i.e. never in a real deployment.
 */
export const DEV_OTP_CODE = "000000";

export interface TwilioVerifyConfig {
  accountSid: string;
  authToken: string;
  serviceSid: string;
}

/** Twilio Verify config, or `undefined` when any credential is unset/blank. */
export function getTwilioConfig(): TwilioVerifyConfig | undefined {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return undefined;
  return { accountSid, authToken, serviceSid };
}

export function isPhoneOtpConfigured(): boolean {
  return getTwilioConfig() !== undefined;
}

/** The minimal `fetch` surface used here — lets tests inject a stub. */
export interface PhoneOtpFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type PhoneOtpFetch = (
  url: string,
  init: {
    method: string;
    body: URLSearchParams;
    headers: Record<string, string>;
  },
) => Promise<PhoneOtpFetchResponse>;

export interface PhoneOtpOptions {
  /** Override `fetch` — the tests inject a stub here. */
  fetchImpl?: PhoneOtpFetch;
}

export interface SendOtpResult {
  /** True when the code was dispatched (or accepted in dev mode). */
  sent: boolean;
  /** True when no creds are configured and Twilio was skipped (dev/test). */
  skipped: boolean;
  /** Twilio verification status (`pending`) when configured. */
  status?: string;
  /** Synthetic error code when `sent` is false. */
  error?: string;
}

export interface CheckOtpResult {
  /** True when the submitted code matched. */
  approved: boolean;
  /** True when no creds are configured and Twilio was skipped (dev/test). */
  skipped: boolean;
  /** Twilio verification-check status (`approved` | `pending` | …). */
  status?: string;
  /** Synthetic error code when the check could not be completed. */
  error?: string;
}

/** HTTP Basic header for the Twilio REST API. Never logged. */
function basicAuthHeader(config: TwilioVerifyConfig): string {
  const token = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
  ).toString("base64");
  return `Basic ${token}`;
}

function resolveFetch(options: PhoneOtpOptions): PhoneOtpFetch {
  return options.fetchImpl ?? (globalThis.fetch as unknown as PhoneOtpFetch);
}

/**
 * Start a phone verification: sends an SMS code to `phone`. In DEV MODE (no
 * creds) it logs the fixed dev code and returns without a network call. Fails
 * **closed** (`sent: false`) on any Twilio/parse error so a caller never reports
 * "code sent" when it wasn't.
 */
export async function sendPhoneOtp(
  phone: string,
  options: PhoneOtpOptions = {},
): Promise<SendOtpResult> {
  const config = getTwilioConfig();
  if (!config) {
    console.info(
      `[auth] DEV phone OTP for ${phone}: ${DEV_OTP_CODE} (no Twilio creds; nothing sent)`,
    );
    return { sent: true, skipped: true };
  }

  const body = new URLSearchParams({ To: phone, Channel: "sms" });

  try {
    const res = await resolveFetch(options)(
      `${TWILIO_VERIFY_BASE}/${config.serviceSid}/Verifications`,
      {
        method: "POST",
        body,
        headers: {
          authorization: basicAuthHeader(config),
          "content-type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!res.ok) {
      return { sent: false, skipped: false, error: `http-${res.status}` };
    }

    const data = (await res.json()) as { status?: string };
    return { sent: true, skipped: false, status: data.status };
  } catch {
    return { sent: false, skipped: false, error: "internal-error" };
  }
}

/**
 * Check a submitted code. In DEV MODE the code must equal {@link DEV_OTP_CODE}.
 * With creds it POSTs to Twilio's VerificationCheck and approves only on
 * `status: "approved"`. Fails **closed** on any error — an unverifiable code
 * must never stamp `phone_verified_at`.
 */
export async function checkPhoneOtp(
  phone: string,
  code: string,
  options: PhoneOtpOptions = {},
): Promise<CheckOtpResult> {
  const config = getTwilioConfig();
  if (!config) {
    const approved = code === DEV_OTP_CODE;
    return {
      approved,
      skipped: true,
      status: approved ? "approved" : "pending",
    };
  }

  const body = new URLSearchParams({ To: phone, Code: code });

  try {
    const res = await resolveFetch(options)(
      `${TWILIO_VERIFY_BASE}/${config.serviceSid}/VerificationCheck`,
      {
        method: "POST",
        body,
        headers: {
          authorization: basicAuthHeader(config),
          "content-type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!res.ok) {
      return { approved: false, skipped: false, error: `http-${res.status}` };
    }

    const data = (await res.json()) as { status?: string };
    return {
      approved: data.status === "approved",
      skipped: false,
      status: data.status,
    };
  } catch {
    return { approved: false, skipped: false, error: "internal-error" };
  }
}
