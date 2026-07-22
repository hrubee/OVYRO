/**
 * POST /api/analytics/beacon — the client → server bridge for the one funnel
 * event with no server mutation to hang off: `inquiry_started` (spec §10).
 *
 * Design constraints, all from the spec's "analytics never distorts or breaks
 * the product" rule:
 *   - `navigator.sendBeacon`-friendly: reads a tiny text/JSON body, returns 204
 *     (the browser discards a beacon response) and never surfaces a 4xx.
 *   - unauthenticated: public listing pages are anonymous, so the endpoint can't
 *     require a session — but it attributes to the signed-in user when there is
 *     one, best-effort.
 *   - IP rate-limited so an open endpoint can't be used to flood the event
 *     stream; fail-open, because a Redis hiccup must never drop real funnel data.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { trackInquiryStarted } from "@/lib/analytics";
import { getActor } from "@/lib/auth/session";
import { limit, rateLimitKey } from "@/lib/rate-limit";
import { beaconClientIp, parseBeaconPayload, readBeaconBody } from "./_lib/payload";

export const dynamic = "force-dynamic";

/** ~one form-open per couple seconds per IP is plenty for real buyers. */
const BEACON_MAX = 30;
const BEACON_WINDOW_SECONDS = 60;

/** 204 No Content — a `sendBeacon` response is discarded and we never error out. */
function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // A malformed / disallowed beacon is dropped silently rather than 400'd — it
  // must not show up as a console error on the visitor's listing page.
  let payload;
  try {
    payload = parseBeaconPayload(readBeaconBody(await request.text()));
  } catch {
    return noContent();
  }

  const ip = beaconClientIp(request.headers);
  const gate = await limit(
    rateLimitKey("analytics:beacon", ip ?? "unknown"),
    BEACON_MAX,
    BEACON_WINDOW_SECONDS,
    { failOpen: true },
  );
  if (!gate.allowed) return noContent();

  // Attribute to the session when present; the endpoint itself needs no auth.
  const actor = await getActor().catch(() => null);

  // `trackInquiryStarted` swallows its own write errors, so this cannot throw.
  await trackInquiryStarted({
    listingId: payload.listingId,
    sellerId: payload.sellerId ?? null,
    userId: actor?.userId ?? null,
    anonId: payload.anonId ?? null,
  });

  return noContent();
}
