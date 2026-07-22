import { describe, expect, test } from "bun:test";
import {
  CONSENT_COOKIE,
  isConsentGranted,
  parseConsentCookie,
  serializeConsentCookie,
} from "./consent";

describe("parseConsentCookie", () => {
  test("returns `unset` for empty / missing input", () => {
    expect(parseConsentCookie(undefined)).toBe("unset");
    expect(parseConsentCookie(null)).toBe("unset");
    expect(parseConsentCookie("")).toBe("unset");
    expect(parseConsentCookie("other=1; another=2")).toBe("unset");
  });

  test("reads `granted` / `denied` even alongside other cookies", () => {
    expect(
      parseConsentCookie(`a=1; ${CONSENT_COOKIE}=granted; b=2`),
    ).toBe("granted");
    expect(parseConsentCookie(`${CONSENT_COOKIE}=denied`)).toBe("denied");
  });

  test("treats a garbage value as undecided (fail safe)", () => {
    expect(parseConsentCookie(`${CONSENT_COOKIE}=maybe`)).toBe("unset");
  });
});

describe("serializeConsentCookie", () => {
  test("writes the value with a path, max-age and SameSite=Lax", () => {
    const cookie = serializeConsentCookie("granted");
    expect(cookie).toContain(`${CONSENT_COOKIE}=granted`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=");
  });

  test("round-trips through parseConsentCookie", () => {
    expect(parseConsentCookie(serializeConsentCookie("granted"))).toBe("granted");
    expect(parseConsentCookie(serializeConsentCookie("denied"))).toBe("denied");
  });
});

describe("isConsentGranted", () => {
  test("only `granted` is truthy", () => {
    expect(isConsentGranted("granted")).toBe(true);
    expect(isConsentGranted("denied")).toBe(false);
    expect(isConsentGranted("unset")).toBe(false);
  });
});
