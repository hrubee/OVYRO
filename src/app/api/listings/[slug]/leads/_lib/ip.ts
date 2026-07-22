/**
 * Client IP + user-agent extraction for lead attribution and rate limiting.
 *
 * On Railway the app runs behind a proxy, so the peer address is the proxy —
 * the real client is the first hop in `x-forwarded-for`. We take that leftmost
 * entry (falling back to `x-real-ip`), never trusting anything after it. Kept as
 * a pure `(headers) -> string | null` so it is unit-testable without a request.
 */

/** Leftmost `x-forwarded-for` hop, else `x-real-ip`, else `null`. */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real && real !== "" ? real : null;
}

/** The caller's user-agent (stored for Meta CAPI match quality), or `null`. */
export function getClientUa(headers: Headers): string | null {
  const ua = headers.get("user-agent")?.trim();
  return ua && ua !== "" ? ua : null;
}
