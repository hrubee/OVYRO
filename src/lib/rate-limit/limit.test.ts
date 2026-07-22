import { afterEach, describe, expect, test } from "bun:test";
import { leadIpKey, leadListingBuyerKey, leadUserKey, rateLimitKey } from "./keys";
import { limit } from "./limit";
import type { RateLimitRedis } from "./store";

/**
 * In-memory stand-in for the sorted-set commands `limit()` uses. Deliberately
 * exercises the *same* code path as production — only the transport differs.
 */
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

/** A store whose every command rejects — stands in for a Redis outage. */
const throwingRedis: RateLimitRedis = {
  zremrangebyscore: async () => {
    throw new Error("connection refused");
  },
  zadd: async () => {
    throw new Error("connection refused");
  },
  zcard: async () => {
    throw new Error("connection refused");
  },
  pexpire: async () => {
    throw new Error("connection refused");
  },
  zrangeWithScoresAsc: async () => {
    throw new Error("connection refused");
  },
};

describe("sliding-window limit() (spec §12)", () => {
  test("allows the first `max` hits and blocks the next within the window", async () => {
    const redis = new FakeRedis();
    const key = leadIpKey("203.0.113.7");

    for (let i = 1; i <= 3; i++) {
      const result = await limit(key, 3, 60, { redis, now: 1_000 + i });
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(i);
      expect(result.remaining).toBe(3 - i);
      expect(result.limit).toBe(3);
    }

    const blocked = await limit(key, 3, 60, { redis, now: 1_005 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.count).toBe(4);
  });

  test("frees a slot once the window slides past the earliest hit", async () => {
    const redis = new FakeRedis();
    const key = "rl:test:slide";

    await limit(key, 2, 10, { redis, now: 0 });
    await limit(key, 2, 10, { redis, now: 1 });
    expect((await limit(key, 2, 10, { redis, now: 5 })).allowed).toBe(false);

    // 10s window (10_000ms); at t=10_050 the early hits have all aged out.
    const recovered = await limit(key, 2, 10, { redis, now: 10_050 });
    expect(recovered.allowed).toBe(true);
    expect(recovered.count).toBe(1);
  });

  test("resetAt is the earliest in-window hit plus the window", async () => {
    const redis = new FakeRedis();
    const key = "rl:test:reset";

    const first = await limit(key, 5, 30, { redis, now: 1_000 });
    expect(first.resetAt).toBe(1_000 + 30_000);

    // A later hit does not move the reset — the oldest hit still governs it.
    const second = await limit(key, 5, 30, { redis, now: 5_000 });
    expect(second.resetAt).toBe(1_000 + 30_000);
  });

  test("max of 0 blocks every request", async () => {
    const redis = new FakeRedis();
    const result = await limit("rl:test:zero", 0, 60, { redis, now: 1_000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  describe("Redis outage", () => {
    const originalWarn = console.warn;
    afterEach(() => {
      console.warn = originalWarn;
    });

    test("fails closed by default", async () => {
      console.warn = () => {};
      const result = await limit("rl:test:down", 5, 60, {
        redis: throwingRedis,
        now: 1_000,
      });
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetAt).toBe(1_000 + 60_000);
    });

    test("fails open when explicitly opted in", async () => {
      console.warn = () => {};
      const result = await limit("rl:test:down", 5, 60, {
        redis: throwingRedis,
        now: 1_000,
        failOpen: true,
      });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });
  });
});

describe("rate-limit keys", () => {
  test("namespaces every key under rl:", () => {
    expect(rateLimitKey("lead:ip", "203.0.113.7")).toBe("rl:lead:ip:203.0.113.7");
    expect(leadIpKey("203.0.113.7")).toBe("rl:lead:ip:203.0.113.7");
    expect(leadUserKey("user_123")).toBe("rl:lead:user:user_123");
    expect(leadListingBuyerKey("listing_1", "user_9")).toBe(
      "rl:lead:listing-buyer:listing_1:user_9",
    );
  });
});
