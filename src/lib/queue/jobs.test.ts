import { describe, expect, test } from "bun:test";
import { QUEUE_NAMES, getJobSchema, jobSchemas, parseJobPayload } from "./jobs";

describe("job registry", () => {
  test("declares every queue the spec calls for", () => {
    expect(QUEUE_NAMES).toEqual([
      "email",
      "meta-capi",
      "media-processing",
      "token-health",
      "listing-expiry",
      "system",
    ]);
  });

  test("every queue declares at least one job", () => {
    for (const queue of QUEUE_NAMES) {
      expect(Object.keys(jobSchemas[queue]).length).toBeGreaterThan(0);
    }
  });

  test("rejects an unknown job name", () => {
    // @ts-expect-error — the point of the registry is that this is a type error too.
    expect(() => getJobSchema("system", "not-a-job")).toThrow(/Unknown job/);
  });
});

describe("parseJobPayload", () => {
  test("accepts a valid email payload", () => {
    const payload = parseJobPayload("email", "send", {
      to: "buyer@example.com",
      subject: "New inquiry on your listing",
      html: "<p>Someone is interested.</p>",
    });

    expect(payload.to).toBe("buyer@example.com");
  });

  test("rejects a malformed recipient", () => {
    expect(() =>
      parseJobPayload("email", "send", {
        to: "not-an-email",
        subject: "hi",
        html: "<p>hi</p>",
      }),
    ).toThrow();
  });

  test("rejects an email payload missing a body", () => {
    expect(() =>
      parseJobPayload("email", "send", { to: "buyer@example.com", subject: "hi" }),
    ).toThrow();
  });

  test("defaults meta-capi userData to an empty object", () => {
    const payload = parseJobPayload("meta-capi", "dispatch-event", {
      sellerId: "seller_1",
      listingId: "listing_1",
      eventId: "evt_1",
      eventName: "Lead",
      eventTimeMs: 1_700_000_000_000,
      sourceUrl: "https://ovyro.com/land/listing_1",
    });

    expect(payload.userData).toEqual({});
  });

  test("rejects a meta-capi event with a non-URL source", () => {
    expect(() =>
      parseJobPayload("meta-capi", "dispatch-event", {
        sellerId: "seller_1",
        listingId: "listing_1",
        eventId: "evt_1",
        eventName: "Lead",
        eventTimeMs: 1_700_000_000_000,
        sourceUrl: "/land/listing_1",
      }),
    ).toThrow();
  });

  test("accepts the system echo job", () => {
    expect(parseJobPayload("system", "echo", { message: "ping" })).toEqual({ message: "ping" });
  });
});
