import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  isCaptchaConfigured,
  verifyCaptcha,
  type CaptchaFetch,
  type CaptchaFetchResponse,
} from "./verify";

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;

/** Records calls and returns a canned siteverify response. */
function stubFetch(response: {
  ok?: boolean;
  status?: number;
  body: unknown;
}): {
  fetchImpl: CaptchaFetch;
  calls: Array<{ url: string; body: URLSearchParams }>;
} {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fetchImpl: CaptchaFetch = async (url, init) => {
    calls.push({ url, body: init.body });
    const res: CaptchaFetchResponse = {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body,
    };
    return res;
  };
  return { fetchImpl, calls };
}

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY;
  } else {
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
  }
});

describe("verifyCaptcha — not configured", () => {
  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  test("no-ops to a pass and never calls fetch (dev/test)", async () => {
    const { fetchImpl, calls } = stubFetch({ body: { success: false } });
    const result = await verifyCaptcha("anything", { fetchImpl });
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(calls).toHaveLength(0);
    expect(isCaptchaConfigured()).toBe(false);
  });
});

describe("verifyCaptcha — configured", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
  });

  test("reports success and posts the secret, token and remoteip", async () => {
    const { fetchImpl, calls } = stubFetch({ body: { success: true } });
    const result = await verifyCaptcha("tok-123", {
      remoteIp: "203.0.113.7",
      fetchImpl,
    });
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(isCaptchaConfigured()).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].body.get("secret")).toBe("test-secret");
    expect(calls[0].body.get("response")).toBe("tok-123");
    expect(calls[0].body.get("remoteip")).toBe("203.0.113.7");
  });

  test("reports Cloudflare failure with its error codes", async () => {
    const { fetchImpl } = stubFetch({
      body: { success: false, "error-codes": ["invalid-input-response"] },
    });
    const result = await verifyCaptcha("bad-token", { fetchImpl });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["invalid-input-response"]);
  });

  test("rejects an empty token without calling fetch", async () => {
    const { fetchImpl, calls } = stubFetch({ body: { success: true } });
    const result = await verifyCaptcha("   ", { fetchImpl });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["missing-input-response"]);
    expect(calls).toHaveLength(0);
  });

  test("fails closed on a non-OK HTTP response", async () => {
    const { fetchImpl } = stubFetch({ ok: false, status: 500, body: {} });
    const result = await verifyCaptcha("tok", { fetchImpl });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["http-500"]);
  });

  test("fails closed when fetch throws", async () => {
    const throwingFetch: CaptchaFetch = async () => {
      throw new Error("network down");
    };
    const result = await verifyCaptcha("tok", { fetchImpl: throwingFetch });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["internal-error"]);
  });
});
