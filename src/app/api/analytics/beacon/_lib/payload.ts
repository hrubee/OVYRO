/**
 * Pure body parsing + client-IP extraction for the analytics beacon
 * (`POST /api/analytics/beacon`). Kept dependency-light (only Zod) so it can be
 * unit-tested without the DB pool, the session layer, or a live request.
 *
 * The beacon exists for the one funnel event (spec §10) that has no server-side
 * mutation to hang off — `inquiry_started`, fired from the public listing page
 * as the visitor is shown the inquiry form. The allow-list is deliberately tiny:
 * this endpoint is unauthenticated, so nothing here may become a way to mint
 * arbitrary events into `analytics_events`.
 */
import { z } from "zod";

/** Events the beacon may write. Only `inquiry_started` for now (spec §10). */
export const BEACON_EVENTS = ["inquiry_started"] as const;
export type BeaconEvent = (typeof BEACON_EVENTS)[number];

/**
 * `.strict()` so a beacon can't smuggle extra keys into `props`; the id bounds
 * keep a hostile caller from stuffing megabytes through an open endpoint.
 */
export const beaconPayloadSchema = z
  .object({
    event: z.enum(BEACON_EVENTS),
    listingId: z.string().min(1).max(64),
    sellerId: z.string().min(1).max(64).optional(),
    /** Cookie/localStorage-scoped id so an anonymous start joins the eventual user. */
    anonId: z.string().min(1).max(64).optional(),
  })
  .strict();

export type BeaconPayload = z.infer<typeof beaconPayloadSchema>;

/** Validate an already-parsed body; throws `ZodError` on anything unexpected. */
export function parseBeaconPayload(raw: unknown): BeaconPayload {
  return beaconPayloadSchema.parse(raw);
}

/**
 * `navigator.sendBeacon` sends a `Blob`, so the body arrives as text regardless
 * of content-type. Parse leniently — a garbage body becomes `null`, which the
 * schema then rejects, and the route drops silently.
 */
export function readBeaconBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Leftmost `x-forwarded-for` hop, else `x-real-ip`, else `null` — the same proxy
 * convention the lead endpoint uses (Railway puts the app behind a proxy).
 */
export function beaconClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real && real !== "" ? real : null;
}
