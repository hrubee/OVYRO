/**
 * Redis sliding-window rate limiter (spec §12).
 *
 * Implemented as a sorted-set log: each hit is a member scored by its wall-clock
 * timestamp. On every call we drop hits older than the window, record the new
 * hit, then count what remains — so the window slides continuously rather than
 * resetting on a fixed boundary (which lets a burst straddle two fixed windows).
 *
 * Dependency-light on purpose: the maths live here as plain async calls against
 * the {@link RateLimitRedis} slice, so both production (ioredis) and the unit
 * tests (in-memory fake) exercise the same code path.
 *
 * The commands run sequentially on one connection rather than in a MULTI. That
 * is safe for the "does this block?" guarantee: a call always awaits its own
 * `zadd` before its own `zcard`, so its hit is always counted — concurrent hits
 * only push the count higher, never lower, so the limiter can never *under*-count
 * and wrongly admit a request.
 *
 * **Failure policy.** If Redis is unavailable the limiter fails **closed** by
 * default (request denied). For lead submission — the endpoint this primarily
 * guards — a brief Redis outage denying inquiries is preferable to opening the
 * spam floodgate (spec §12). Callers on non-critical paths can opt into
 * fail-open via {@link RateLimitOptions.failOpen}.
 */
import { getDefaultStore, type RateLimitRedis } from "./store";

export interface RateLimitResult {
  /** True when this hit is within the allowance. */
  allowed: boolean;
  /** The `max` that was applied (echoed for `X-RateLimit-Limit` headers). */
  limit: number;
  /** Hits still available in the current window (0 once blocked). */
  remaining: number;
  /** Hits counted in the window, including this one. */
  count: number;
  /** Epoch ms at which the window frees a slot (the oldest hit + window). */
  resetAt: number;
}

export interface RateLimitOptions {
  /** Override the store — the tests inject an in-memory fake here. */
  redis?: RateLimitRedis;
  /** Override "now" (epoch ms) — a test seam for advancing the window. */
  now?: number;
  /** Allow the request when Redis is unavailable. Defaults to fail-closed. */
  failOpen?: boolean;
}

/**
 * Per-process counter that makes each hit's sorted-set member unique even when
 * several calls land on the same millisecond. Collisions across processes are
 * astronomically unlikely and merely merge two hits — a harmless under-count.
 */
let sequence = 0;

/**
 * Record a hit against `key` and report whether it is within `max` hits per
 * `windowSeconds`. The first `max` hits in any window are allowed; the next is
 * blocked.
 */
export async function limit(
  key: string,
  max: number,
  windowSeconds: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const windowMs = windowSeconds * 1_000;
  const failOpen = options.failOpen ?? false;

  try {
    const redis = options.redis ?? getDefaultStore();

    // 1. Evict hits that have aged out of the window.
    await redis.zremrangebyscore(key, 0, now - windowMs);
    // 2. Record this hit.
    await redis.zadd(key, now, `${now}-${sequence++}`);
    // 3. Count what's left (includes the hit just added).
    const count = await redis.zcard(key);
    // 4. Let the key self-evict once idle for a full window.
    await redis.pexpire(key, windowMs);
    // 5. The oldest surviving hit determines when a slot next frees.
    const oldest = await redis.zrangeWithScoresAsc(key, 0, 0);
    const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now;

    return {
      allowed: count <= max,
      limit: max,
      remaining: Math.max(0, max - count),
      count,
      resetAt: oldestScore + windowMs,
    };
  } catch (error) {
    console.warn(
      `[rate-limit] Redis unavailable; failing ${failOpen ? "open" : "closed"}.`,
      error instanceof Error ? error.message : error,
    );
    return {
      allowed: failOpen,
      limit: max,
      remaining: failOpen ? max : 0,
      count: failOpen ? 0 : max + 1,
      resetAt: now + windowMs,
    };
  }
}
