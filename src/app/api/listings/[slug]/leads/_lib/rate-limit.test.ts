import { describe, expect, test } from "bun:test";
import type { RateLimitRedis } from "@/lib/rate-limit";
import { enforceInquiryRateLimits, INQUIRY_RATE_LIMITS } from "./rate-limit";
import { RateLimitedError } from "./http";

/** In-memory sorted-set store — the same fake the leads-core limiter tests use. */
class FakeRedis implements RateLimitRedis {
  private sets = new Map<string, Array<{ score: number; member: string }>>();

  private entries(key: string): Array<{ score: number; member: string }> {
    let entry = this.sets.get(key);
    if (!entry) {
      entry = [];
      this.sets.set(key, entry);
    }
    return entry;
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    const entry = this.entries(key);
    const kept = entry.filter((e) => e.score < min || e.score > max);
    this.sets.set(key, kept);
    return entry.length - kept.length;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    this.entries(key).push({ score, member });
    return 1;
  }

  async zcard(key: string): Promise<number> {
    return this.entries(key).length;
  }

  async pexpire(): Promise<number> {
    return 1;
  }

  async zrangeWithScoresAsc(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    const sorted = [...this.entries(key)].sort((a, b) => a.score - b.score);
    const slice = stop < 0 ? sorted.slice(start) : sorted.slice(start, stop + 1);
    return slice.flatMap((e) => [e.member, String(e.score)]);
  }
}

const NOW = 1_700_000_000_000;

describe("enforceInquiryRateLimits (spec §4.2.2, §12)", () => {
  test("allows the first inquiry", async () => {
    const redis = new FakeRedis();
    await expect(
      enforceInquiryRateLimits(
        { ip: "203.0.113.7", userId: "user_1", listingId: "listing_1" },
        { redis, now: NOW },
      ),
    ).resolves.toBeUndefined();
  });

  test("blocks a second inquiry on the same listing (1 per 72h)", async () => {
    const redis = new FakeRedis();
    const target = { ip: "203.0.113.7", userId: "user_1", listingId: "listing_1" };
    await enforceInquiryRateLimits(target, { redis, now: NOW });
    await expect(
      enforceInquiryRateLimits(target, { redis, now: NOW + 1_000 }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  test("blocks a 20-inquiry burst on one listing (acceptance)", async () => {
    const redis = new FakeRedis();
    const target = { ip: "203.0.113.7", userId: "user_burst", listingId: "listing_x" };
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      try {
        await enforceInquiryRateLimits(target, { redis, now: NOW + i });
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitedError);
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  test("caps a user at 10 inquiries/day across different listings", async () => {
    const redis = new FakeRedis();
    // Different listing each time so the per-listing window never trips first.
    for (let i = 0; i < INQUIRY_RATE_LIMITS.user.max; i++) {
      await enforceInquiryRateLimits(
        { ip: "203.0.113.7", userId: "user_hot", listingId: `listing_${i}` },
        { redis, now: NOW + i },
      );
    }
    await expect(
      enforceInquiryRateLimits(
        { ip: "203.0.113.7", userId: "user_hot", listingId: "listing_final" },
        { redis, now: NOW + 100 },
      ),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  test("caps a shared IP once per-user/per-listing windows can't trip", async () => {
    const redis = new FakeRedis();
    // Distinct user + listing each hit → only the per-IP window accumulates.
    for (let i = 0; i < INQUIRY_RATE_LIMITS.ip.max; i++) {
      await enforceInquiryRateLimits(
        { ip: "198.51.100.9", userId: `user_${i}`, listingId: `listing_${i}` },
        { redis, now: NOW + i },
      );
    }
    await expect(
      enforceInquiryRateLimits(
        { ip: "198.51.100.9", userId: "user_last", listingId: "listing_last" },
        { redis, now: NOW + 1_000 },
      ),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  test("still enforces per-user limits when the IP is unknown", async () => {
    const redis = new FakeRedis();
    for (let i = 0; i < INQUIRY_RATE_LIMITS.user.max; i++) {
      await enforceInquiryRateLimits(
        { ip: null, userId: "user_noip", listingId: `listing_${i}` },
        { redis, now: NOW + i },
      );
    }
    await expect(
      enforceInquiryRateLimits(
        { ip: null, userId: "user_noip", listingId: "listing_z" },
        { redis, now: NOW + 100 },
      ),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  test("attaches a positive Retry-After hint", async () => {
    const redis = new FakeRedis();
    const target = { ip: "203.0.113.7", userId: "user_1", listingId: "listing_1" };
    await enforceInquiryRateLimits(target, { redis, now: NOW });
    try {
      await enforceInquiryRateLimits(target, { redis, now: NOW + 1_000 });
      throw new Error("expected a RateLimitedError");
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
