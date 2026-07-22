import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  OTP_SEND_MAX_PER_IP,
  OTP_SEND_MAX_PER_PHONE,
  OtpError,
  errorResponse,
  getClientIp,
  normalizePhone,
  otpSendIpKey,
  otpSendPhoneKey,
  sendOtpSchema,
  verifyOtpSchema,
} from "./shared";

describe("sendOtpSchema", () => {
  test("accepts an E.164 number and a plain digit string", () => {
    expect(sendOtpSchema.parse({ phone: "+15551234567" }).phone).toBe(
      "+15551234567",
    );
    expect(sendOtpSchema.parse({ phone: "15551234567" }).phone).toBe(
      "15551234567",
    );
  });

  test("trims surrounding whitespace", () => {
    expect(sendOtpSchema.parse({ phone: "  +15551234567 " }).phone).toBe(
      "+15551234567",
    );
  });

  test("rejects too-short, non-numeric, and mass-assigned fields", () => {
    expect(() => sendOtpSchema.parse({ phone: "123" })).toThrow(z.ZodError);
    expect(() => sendOtpSchema.parse({ phone: "not-a-phone" })).toThrow(
      z.ZodError,
    );
    // `.strict()` blocks smuggling server-owned fields through the body.
    expect(() =>
      sendOtpSchema.parse({ phone: "+15551234567", userId: "u_evil" }),
    ).toThrow(z.ZodError);
  });
});

describe("verifyOtpSchema", () => {
  test("accepts a phone plus a 4–10 digit code", () => {
    const parsed = verifyOtpSchema.parse({
      phone: "+15551234567",
      code: "654321",
    });
    expect(parsed.code).toBe("654321");
  });

  test("rejects non-numeric or wrong-length codes", () => {
    expect(() =>
      verifyOtpSchema.parse({ phone: "+15551234567", code: "12a4" }),
    ).toThrow(z.ZodError);
    expect(() =>
      verifyOtpSchema.parse({ phone: "+15551234567", code: "12" }),
    ).toThrow(z.ZodError);
  });
});

describe("normalizePhone", () => {
  test("ensures a single leading +", () => {
    expect(normalizePhone("15551234567")).toBe("+15551234567");
    expect(normalizePhone("+15551234567")).toBe("+15551234567");
  });
});

describe("rate-limit keys", () => {
  test("live under the shared rl: namespace and separate phone from IP", () => {
    expect(otpSendPhoneKey("+15551234567")).toBe(
      "rl:otp:send:phone:+15551234567",
    );
    expect(otpSendIpKey("203.0.113.7")).toBe("rl:otp:send:ip:203.0.113.7");
  });

  test("the per-IP allowance is wider than the per-phone allowance", () => {
    expect(OTP_SEND_MAX_PER_IP).toBeGreaterThan(OTP_SEND_MAX_PER_PHONE);
  });
});

describe("getClientIp", () => {
  test("takes the first hop of x-forwarded-for", () => {
    const request = new Request("https://ovyro.test/api/auth/otp/send", {
      headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("198.51.100.9");
  });

  test("falls back to x-real-ip, then to a sentinel", () => {
    const withReal = new Request("https://ovyro.test/", {
      headers: { "x-real-ip": "203.0.113.5" },
    });
    expect(getClientIp(withReal)).toBe("203.0.113.5");

    const bare = new Request("https://ovyro.test/");
    expect(getClientIp(bare)).toBe("unknown");
  });
});

describe("errorResponse", () => {
  test("maps a ZodError to 422 with issues", async () => {
    let caught: unknown;
    try {
      sendOtpSchema.parse({ phone: "nope" });
    } catch (error) {
      caught = error;
    }
    const res = errorResponse(caught);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("validation_error");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  test("maps an OtpError to its own status and code", async () => {
    const res = errorResponse(
      new OtpError("rate_limited", "Slow down.", 429),
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("rate_limited");
    expect(body.message).toBe("Slow down.");
  });

  test("maps an unknown error to a 500 without leaking detail", async () => {
    const res = errorResponse(new Error("db exploded with secrets"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("internal_error");
    expect(body.message).toBe("Something went wrong.");
  });
});
