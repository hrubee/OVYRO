/**
 * Inquiry rate limiting (spec §4.2.2 anti-abuse, §12).
 *
 * Three sliding windows layered over the leads-core limiter, checked
 * most-specific first so a legitimate duplicate gets the clearest message:
 *   - per (listing, buyer): 1 inquiry / 72h — kills duplicate spam,
 *   - per user: 10 inquiries / day,
 *   - per IP: an anonymous-spam shield.
 *
 * The limiter fails closed (a Redis outage denies inquiries, per §12), so a
 * 20-inquiry burst is always blocked. Options (`redis`, `now`) pass straight
 * through to `limit()`, letting the tests drive the same code path with an
 * in-memory store.
 */
import {
  leadIpKey,
  leadListingBuyerKey,
  leadUserKey,
  limit,
  type RateLimitOptions,
} from "@/lib/rate-limit";
import { RateLimitedError } from "./http";

const HOUR = 3_600;
const DAY = 24 * HOUR;

export const INQUIRY_RATE_LIMITS = {
  /** spec §4.2.2: one inquiry per listing per 72h. */
  listingBuyer: { max: 1, windowSeconds: 72 * HOUR },
  /** spec §4.2.2: up to ~10 inquiries per day per user. */
  user: { max: 10, windowSeconds: DAY },
  /** Anonymous-spam shield keyed on the client IP. */
  ip: { max: 20, windowSeconds: HOUR },
} as const;

export interface InquiryRateLimitTarget {
  ip: string | null;
  userId: string;
  listingId: string;
}

interface RateLimitCheck {
  key: string;
  max: number;
  windowSeconds: number;
  message: string;
}

/**
 * Enforce every inquiry limit. Throws `RateLimitedError` (429) on the first
 * exhausted window, with a caller-friendly message and a `Retry-After` hint.
 */
export async function enforceInquiryRateLimits(
  target: InquiryRateLimitTarget,
  options: RateLimitOptions = {},
): Promise<void> {
  const { ip, userId, listingId } = target;
  const now = options.now ?? Date.now();

  const checks: RateLimitCheck[] = [
    {
      key: leadListingBuyerKey(listingId, userId),
      ...INQUIRY_RATE_LIMITS.listingBuyer,
      message: "You've already sent an inquiry for this listing. Try again later.",
    },
    {
      key: leadUserKey(userId),
      ...INQUIRY_RATE_LIMITS.user,
      message: "You've reached today's inquiry limit. Try again tomorrow.",
    },
  ];
  if (ip) {
    checks.push({
      key: leadIpKey(ip),
      ...INQUIRY_RATE_LIMITS.ip,
      message: "Too many inquiries from your network. Try again later.",
    });
  }

  for (const check of checks) {
    const result = await limit(check.key, check.max, check.windowSeconds, options);
    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - now) / 1_000));
      throw new RateLimitedError(check.message, retryAfterSeconds);
    }
  }
}
