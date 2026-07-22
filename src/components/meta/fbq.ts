/**
 * Client-side glue for calling the Meta Pixel's global `fbq` (spec §5.3).
 *
 * The base loader is injected by {@link MetaPixel} only when the listing owner
 * has a pixel AND consent is granted. Everything here therefore no-ops when no
 * pixel is active, so callers (the inquiry form) can fire unconditionally.
 */
import type { MetaContentParams } from "./pixel-logic";

interface FbqFn {
  (...args: unknown[]): void;
}

/** The page's active `fbq`, or null when no pixel has loaded. */
export function getFbq(): FbqFn | null {
  if (typeof window === "undefined") return null;
  const fbq = (window as unknown as { fbq?: FbqFn }).fbq;
  return typeof fbq === "function" ? fbq : null;
}

/**
 * Fire a standard Lead conversion. No-ops entirely when no pixel is active, so
 * it is safe to call on every successful inquiry regardless of consent state.
 *
 * `eventId` is Meta's `eventID` de-duplication key — passed through when the
 * lead API surfaces one, so a future server CAPI send could be de-duped against
 * this browser event.
 */
export function trackLead(content: MetaContentParams, eventId?: string): void {
  const fbq = getFbq();
  if (!fbq) return;
  if (eventId) {
    fbq("track", "Lead", content, { eventID: eventId });
  } else {
    fbq("track", "Lead", content);
  }
}
