/**
 * Rate-limit key builders (spec §12).
 *
 * Every key lives under the `rl:` prefix so limiter state is easy to scan, and
 * `MONITOR`/`FLUSHDB`-free, in Redis and never collides with BullMQ's own keys.
 * The `<namespace>` segment groups a limit (e.g. `lead:ip`) and the identifier
 * is the thing being throttled (an IP, a user id, a listing+buyer pair).
 */
const PREFIX = "rl";

export function rateLimitKey(namespace: string, identifier: string): string {
  return `${PREFIX}:${namespace}:${identifier}`;
}

/** Per-IP lead-submission throttle — the front line against anonymous spam. */
export const leadIpKey = (ip: string): string => rateLimitKey("lead:ip", ip);

/** Per-authenticated-buyer lead-submission throttle. */
export const leadUserKey = (userId: string): string =>
  rateLimitKey("lead:user", userId);

/**
 * Per (listing, buyer) throttle — backs the "one inquiry per listing per day"
 * duplicate suppression that spec §6 deliberately keeps out of the schema.
 */
export const leadListingBuyerKey = (listingId: string, buyerId: string): string =>
  rateLimitKey("lead:listing-buyer", `${listingId}:${buyerId}`);
