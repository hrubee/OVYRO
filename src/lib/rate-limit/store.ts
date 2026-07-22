/**
 * The narrow slice of Redis the sliding-window limiter needs.
 *
 * `limit()` depends only on this interface, never on ioredis directly, so the
 * unit tests can drive it with an in-memory fake (no network, no ephemeral
 * server) while production runs the real sorted-set commands. Method names are
 * intentionally semantic (`zrangeWithScoresAsc`) rather than mirroring ioredis'
 * heavily-overloaded signatures — that keeps the fake trivial to write.
 */
import type { Redis } from "ioredis";
import { getRedisConnection } from "@/lib/queue";

export interface RateLimitRedis {
  /** Drop every member whose score is in [min, max]. Returns the count removed. */
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  /** Add `member` at `score`. Members are unique per call so this always inserts. */
  zadd(key: string, score: number, member: string): Promise<number | string>;
  /** Number of members currently in the set. */
  zcard(key: string): Promise<number>;
  /** Refresh the key's TTL so idle windows self-evict from Redis. */
  pexpire(key: string, ms: number): Promise<number>;
  /** `[member, score, member, score, …]` ordered by ascending score. */
  zrangeWithScoresAsc(key: string, start: number, stop: number): Promise<string[]>;
}

/** Adapts a real ioredis connection to {@link RateLimitRedis}. */
export function ioRedisStore(redis: Redis): RateLimitRedis {
  return {
    zremrangebyscore: (key, min, max) => redis.zremrangebyscore(key, min, max),
    zadd: (key, score, member) => redis.zadd(key, score, member),
    zcard: (key) => redis.zcard(key),
    pexpire: (key, ms) => redis.pexpire(key, ms),
    zrangeWithScoresAsc: (key, start, stop) =>
      redis.zrange(key, start, stop, "WITHSCORES"),
  };
}

let store: RateLimitRedis | null = null;

/**
 * Process-wide singleton over the shared BullMQ connection (spec §8). Reads
 * REDIS_URL lazily via `getRedisConnection`, so importing this module stays
 * side-effect free and a missing URL surfaces only when a limit is actually
 * checked (where `limit()` catches it and applies its fail policy).
 */
export function getDefaultStore(): RateLimitRedis {
  store ??= ioRedisStore(getRedisConnection());
  return store;
}

/** Test seam — drops the memoized store. */
export function resetDefaultStore(): void {
  store = null;
}
