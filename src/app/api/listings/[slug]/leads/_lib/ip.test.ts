import { describe, expect, test } from "bun:test";
import { getClientIp, getClientUa } from "./ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("getClientIp", () => {
  test("takes the leftmost x-forwarded-for hop", () => {
    expect(
      getClientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })),
    ).toBe("203.0.113.7");
  });

  test("trims whitespace around the hop", () => {
    expect(getClientIp(h({ "x-forwarded-for": "  198.51.100.5 " }))).toBe(
      "198.51.100.5",
    );
  });

  test("falls back to x-real-ip", () => {
    expect(getClientIp(h({ "x-real-ip": "192.0.2.44" }))).toBe("192.0.2.44");
  });

  test("prefers x-forwarded-for over x-real-ip", () => {
    expect(
      getClientIp(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "192.0.2.44" })),
    ).toBe("203.0.113.7");
  });

  test("returns null when no IP header is present", () => {
    expect(getClientIp(h({}))).toBeNull();
  });

  test("returns null for a blank x-forwarded-for", () => {
    expect(getClientIp(h({ "x-forwarded-for": "  " }))).toBeNull();
  });
});

describe("getClientUa", () => {
  test("returns the user-agent when present", () => {
    expect(getClientUa(h({ "user-agent": "Mozilla/5.0" }))).toBe("Mozilla/5.0");
  });

  test("returns null when absent", () => {
    expect(getClientUa(h({}))).toBeNull();
  });
});
