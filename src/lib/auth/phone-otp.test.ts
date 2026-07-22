import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEV_OTP_CODE,
  checkPhoneOtp,
  isPhoneOtpConfigured,
  sendPhoneOtp,
  type PhoneOtpFetch,
  type PhoneOtpFetchResponse,
} from "./phone-otp";

const TWILIO_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
] as const;

const ORIGINAL: Record<string, string | undefined> = Object.fromEntries(
  TWILIO_ENV.map((key) => [key, process.env[key]]),
);

/** Records calls and returns a canned Twilio response. */
function stubFetch(response: {
  ok?: boolean;
  status?: number;
  body: unknown;
}): {
  fetchImpl: PhoneOtpFetch;
  calls: Array<{ url: string; body: URLSearchParams; headers: Record<string, string> }>;
} {
  const calls: Array<{
    url: string;
    body: URLSearchParams;
    headers: Record<string, string>;
  }> = [];
  const fetchImpl: PhoneOtpFetch = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    const res: PhoneOtpFetchResponse = {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body,
    };
    return res;
  };
  return { fetchImpl, calls };
}

function clearTwilioEnv(): void {
  for (const key of TWILIO_ENV) delete process.env[key];
}

afterEach(() => {
  for (const key of TWILIO_ENV) {
    if (ORIGINAL[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL[key];
  }
});

describe("phone OTP — dev mode (no Twilio creds)", () => {
  beforeEach(clearTwilioEnv);

  test("reports unconfigured", () => {
    expect(isPhoneOtpConfigured()).toBe(false);
  });

  test("send skips Twilio and never touches the network", async () => {
    const { fetchImpl, calls } = stubFetch({ body: { status: "pending" } });
    const result = await sendPhoneOtp("+15551234567", { fetchImpl });
    expect(result.sent).toBe(true);
    expect(result.skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("check approves only the fixed dev code, without a network call", async () => {
    const { fetchImpl, calls } = stubFetch({ body: { status: "approved" } });

    const ok = await checkPhoneOtp("+15551234567", DEV_OTP_CODE, { fetchImpl });
    expect(ok.approved).toBe(true);
    expect(ok.skipped).toBe(true);

    const bad = await checkPhoneOtp("+15551234567", "123456", { fetchImpl });
    expect(bad.approved).toBe(false);
    expect(bad.skipped).toBe(true);

    expect(calls).toHaveLength(0);
  });
});

describe("phone OTP — configured (Twilio creds present)", () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok_secret";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA_service";
  });

  test("reports configured", () => {
    expect(isPhoneOtpConfigured()).toBe(true);
  });

  test("send POSTs To+Channel to the Verifications endpoint with Basic auth", async () => {
    const { fetchImpl, calls } = stubFetch({ body: { status: "pending" } });
    const result = await sendPhoneOtp("+15551234567", { fetchImpl });

    expect(result.sent).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.status).toBe("pending");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://verify.twilio.com/v2/Services/VA_service/Verifications",
    );
    expect(calls[0].body.get("To")).toBe("+15551234567");
    expect(calls[0].body.get("Channel")).toBe("sms");
    // AC_test:tok_secret base64-encoded.
    const expected = `Basic ${Buffer.from("AC_test:tok_secret").toString("base64")}`;
    expect(calls[0].headers.authorization).toBe(expected);
  });

  test("check approves on Twilio status 'approved'", async () => {
    const { fetchImpl, calls } = stubFetch({ body: { status: "approved" } });
    const result = await checkPhoneOtp("+15551234567", "654321", { fetchImpl });

    expect(result.approved).toBe(true);
    expect(result.skipped).toBe(false);
    expect(calls[0].url).toBe(
      "https://verify.twilio.com/v2/Services/VA_service/VerificationCheck",
    );
    expect(calls[0].body.get("Code")).toBe("654321");
  });

  test("check rejects on any non-approved Twilio status", async () => {
    const { fetchImpl } = stubFetch({ body: { status: "pending" } });
    const result = await checkPhoneOtp("+15551234567", "000000", { fetchImpl });
    expect(result.approved).toBe(false);
    expect(result.status).toBe("pending");
  });

  test("send fails closed on a non-OK HTTP response", async () => {
    const { fetchImpl } = stubFetch({ ok: false, status: 429, body: {} });
    const result = await sendPhoneOtp("+15551234567", { fetchImpl });
    expect(result.sent).toBe(false);
    expect(result.error).toBe("http-429");
  });

  test("check fails closed when fetch throws", async () => {
    const throwing: PhoneOtpFetch = async () => {
      throw new Error("network down");
    };
    const result = await checkPhoneOtp("+15551234567", "654321", {
      fetchImpl: throwing,
    });
    expect(result.approved).toBe(false);
    expect(result.error).toBe("internal-error");
  });
});
