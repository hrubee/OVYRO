import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import {
  beaconClientIp,
  parseBeaconPayload,
  readBeaconBody,
} from "./payload";

describe("parseBeaconPayload", () => {
  test("accepts a minimal inquiry_started beacon", () => {
    const payload = parseBeaconPayload({
      event: "inquiry_started",
      listingId: "listing_1",
    });
    expect(payload).toEqual({ event: "inquiry_started", listingId: "listing_1" });
  });

  test("keeps optional sellerId and anonId", () => {
    const payload = parseBeaconPayload({
      event: "inquiry_started",
      listingId: "l1",
      sellerId: "s1",
      anonId: "a1",
    });
    expect(payload).toMatchObject({ sellerId: "s1", anonId: "a1" });
  });

  test("rejects an event outside the beacon allow-list", () => {
    expect(() =>
      parseBeaconPayload({ event: "save", listingId: "l1" }),
    ).toThrow(ZodError);
    expect(() =>
      parseBeaconPayload({ event: "signup", listingId: "l1" }),
    ).toThrow(ZodError);
  });

  test("rejects a missing or empty listingId", () => {
    expect(() => parseBeaconPayload({ event: "inquiry_started" })).toThrow(
      ZodError,
    );
    expect(() =>
      parseBeaconPayload({ event: "inquiry_started", listingId: "" }),
    ).toThrow(ZodError);
  });

  test("rejects unknown keys so nothing can be smuggled into props", () => {
    expect(() =>
      parseBeaconPayload({
        event: "inquiry_started",
        listingId: "l1",
        props: { evil: true },
      }),
    ).toThrow(ZodError);
  });

  test("rejects an over-long id", () => {
    expect(() =>
      parseBeaconPayload({ event: "inquiry_started", listingId: "x".repeat(65) }),
    ).toThrow(ZodError);
  });
});

describe("readBeaconBody", () => {
  test("parses a JSON string body", () => {
    expect(readBeaconBody('{"event":"inquiry_started","listingId":"l1"}')).toEqual(
      { event: "inquiry_started", listingId: "l1" },
    );
  });

  test("returns null for a non-JSON body rather than throwing", () => {
    expect(readBeaconBody("not json")).toBeNull();
    expect(readBeaconBody("")).toBeNull();
  });
});

describe("beaconClientIp", () => {
  test("takes the leftmost x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(beaconClientIp(headers)).toBe("203.0.113.5");
  });

  test("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.9" });
    expect(beaconClientIp(headers)).toBe("198.51.100.9");
  });

  test("is null when neither header is present", () => {
    expect(beaconClientIp(new Headers())).toBeNull();
  });
});
