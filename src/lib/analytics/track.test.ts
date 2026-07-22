import { describe, expect, test } from "bun:test";
import type { Db } from "@/lib/db";
import {
  isLikelyBot,
  track,
  trackListingView,
  trackSignup,
} from "./track";

/** Minimal `Db` stub capturing what `.insert(...).values(...)` was handed. */
function fakeDb() {
  const values: Record<string, unknown>[] = [];
  const db = {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        values.push(row);
        return Promise.resolve();
      },
    }),
  } as unknown as Db;
  return { db, values };
}

describe("isLikelyBot", () => {
  test("treats a missing or blank user-agent as a bot", () => {
    expect(isLikelyBot(undefined)).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("")).toBe(true);
    expect(isLikelyBot("   ")).toBe(true);
  });

  test("flags crawlers, scrapers, previewers and HTTP libraries", () => {
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "node-fetch/1.0",
      "Go-http-client/1.1",
      "Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/120.0",
      "Chrome-Lighthouse",
    ]) {
      expect(isLikelyBot(ua)).toBe(true);
    }
  });

  test("passes real browser user-agents", () => {
    for (const ua of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ]) {
      expect(isLikelyBot(ua)).toBe(false);
    }
  });
});

describe("track", () => {
  test("inserts the event with nullable fields defaulted to null", async () => {
    const { db, values } = fakeDb();
    await track({ name: "save", listingId: "l1", userId: "u1" }, { db });
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      eventName: "save",
      listingId: "l1",
      userId: "u1",
      anonId: null,
      sellerId: null,
      propsJsonb: null,
    });
  });

  test("never throws — a write failure is swallowed", async () => {
    const db = {
      insert: () => ({
        values: () => Promise.reject(new Error("db down")),
      }),
    } as unknown as Db;
    // Resolves rather than rejecting: analytics must not break the request.
    await expect(track({ name: "signup", userId: "u1" }, { db })).resolves.toBeUndefined();
  });
});

describe("trackListingView", () => {
  test("skips the write and reports false for bot traffic", async () => {
    const { db, values } = fakeDb();
    const tracked = await trackListingView(
      { listingId: "l1", userAgent: "Googlebot/2.1" },
      { db },
    );
    expect(tracked).toBe(false);
    expect(values).toHaveLength(0);
  });

  test("records a listing_view for a real browser", async () => {
    const { db, values } = fakeDb();
    const tracked = await trackListingView(
      {
        listingId: "l1",
        sellerId: "s1",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
      { db },
    );
    expect(tracked).toBe(true);
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      eventName: "listing_view",
      listingId: "l1",
      sellerId: "s1",
    });
  });
});

describe("trackSignup", () => {
  test("stamps the role into props so the rollup can split buyers/sellers", async () => {
    const { db, values } = fakeDb();
    await trackSignup({ userId: "u1", role: "seller" }, { db });
    expect(values[0]).toMatchObject({
      eventName: "signup",
      userId: "u1",
      propsJsonb: { role: "seller" },
    });
  });

  test("defaults the role to buyer", async () => {
    const { db, values } = fakeDb();
    await trackSignup({ userId: "u2" }, { db });
    expect(values[0].propsJsonb).toMatchObject({ role: "buyer" });
  });
});
