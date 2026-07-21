import { afterEach, describe, expect, test } from "bun:test";
import { getFromAddress, isEmailConfigured, resetEmailClient, sendEmail } from "./index";

const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.EMAIL_FROM;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv("RESEND_API_KEY", originalKey);
  restoreEnv("EMAIL_FROM", originalFrom);
  resetEmailClient();
});

describe("sendEmail", () => {
  test("no-ops without RESEND_API_KEY instead of hitting the network", async () => {
    delete process.env.RESEND_API_KEY;
    resetEmailClient();

    const result = await sendEmail({
      to: "buyer@example.com",
      subject: "New inquiry",
      html: "<p>Someone is interested.</p>",
    });

    expect(result).toEqual({ delivered: false, reason: "not-configured" });
  });
});

describe("isEmailConfigured", () => {
  test("tracks RESEND_API_KEY", () => {
    delete process.env.RESEND_API_KEY;
    expect(isEmailConfigured()).toBe(false);

    process.env.RESEND_API_KEY = "re_test";
    expect(isEmailConfigured()).toBe(true);
  });
});

describe("getFromAddress", () => {
  test("falls back to the default sender", () => {
    delete process.env.EMAIL_FROM;
    expect(getFromAddress()).toBe("Ovyro <noreply@ovyro.com>");
  });

  test("honours EMAIL_FROM", () => {
    process.env.EMAIL_FROM = "Ovyro <hello@ovyro.com>";
    expect(getFromAddress()).toBe("Ovyro <hello@ovyro.com>");
  });
});
