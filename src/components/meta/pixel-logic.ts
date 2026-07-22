/**
 * Pure, DB- and DOM-free logic for the seller Meta Pixel (spec §5.2).
 *
 * Every decision about WHICH pixel fires and WHAT it fires lives here, so it is
 * unit-testable without a browser or a database. The React pieces in this folder
 * are thin shells over these functions.
 *
 * ISOLATION (spec R-4): a listing landing page may fire ONLY its own owner's
 * pixel. {@link pixelIdForOwner} is the single chokepoint that guarantees it —
 * it indexes the connection lookup strictly by the listing owner's id, so
 * seller B's page can never resolve seller A's pixel. {@link pixelBootScript}
 * inits exactly one id and never references another.
 */

/** Meta pixel/dataset IDs are numeric (in practice 15–16 digits). */
export const PIXEL_ID_PATTERN = /^\d{8,20}$/;

export function isValidPixelId(value: unknown): value is string {
  return typeof value === "string" && PIXEL_ID_PATTERN.test(value.trim());
}

/** Canonical (trimmed) pixel id, or null when the input is not a valid id. */
export function normalizePixelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return PIXEL_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** The subset of a `meta_connections` row the pixel path reads. */
export interface OwnerPixelConnection {
  pixelId: string | null;
  status: string;
}

/**
 * The pixel id to fire for one connection, or null when it must NOT fire:
 * no connection, a non-`active` status, or a missing/invalid pixel id.
 */
export function resolveOwnerPixelId(
  connection: OwnerPixelConnection | null | undefined,
): string | null {
  if (!connection) return null;
  if (connection.status !== "active") return null;
  return normalizePixelId(connection.pixelId);
}

/**
 * R-4 chokepoint: resolve the pixel for a listing strictly from its OWNER's
 * connection. `byOwnerId` maps user id → their connection; indexing by
 * `ownerId` is what guarantees another seller's pixel can never leak onto this
 * page.
 */
export function pixelIdForOwner(
  ownerId: string,
  byOwnerId: Readonly<
    Record<string, OwnerPixelConnection | null | undefined>
  >,
): string | null {
  return resolveOwnerPixelId(byOwnerId[ownerId]);
}

/** Standard commerce params for a land-listing event (ViewContent / Lead). */
export interface MetaContentParams {
  content_ids: [string];
  content_type: "product";
  value: number;
  currency: string;
}

export function contentParams(input: {
  listingId: string;
  value: number;
  currency: string;
}): MetaContentParams {
  return {
    content_ids: [input.listingId],
    content_type: "product",
    value: input.value,
    currency: input.currency,
  };
}

/** JSON, escaped so it is safe to embed inside an inline `<script>`. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** The standard Meta Pixel base loader (`fbevents.js`), verbatim from Meta. */
const BASE_LOADER =
  "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?" +
  "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;" +
  "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;" +
  "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window," +
  "document,'script','https://connect.facebook.net/en_US/fbevents.js');";

/**
 * The inline script that boots exactly ONE pixel and fires PageView +
 * ViewContent. Throws when `pixelId` is not a valid numeric id, so a malformed
 * (or attacker-supplied) id can never reach the DOM.
 */
export function pixelBootScript(
  pixelId: string,
  content: MetaContentParams,
): string {
  if (!isValidPixelId(pixelId)) {
    throw new Error("Refusing to boot Meta Pixel with a non-numeric id.");
  }
  return [
    BASE_LOADER,
    `fbq('init','${pixelId}');`,
    "fbq('track','PageView');",
    `fbq('track','ViewContent',${inlineJson(content)});`,
  ].join("\n");
}
