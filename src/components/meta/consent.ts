/**
 * Cookie-based consent for marketing scripts (spec §5.2). The Meta Pixel loads
 * only after the visitor accepts; no decision (or a decline) means no pixel.
 *
 * These are pure string helpers — no `document` — so they unit-test without a
 * DOM. The client provider in this folder reads/writes `document.cookie` through
 * them.
 */

export const CONSENT_COOKIE = "ovyro_marketing_consent";

/** ~180 days — long enough that a returning visitor is not re-prompted. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;

export type ConsentValue = "granted" | "denied";
/** `"unset"` = the visitor has not decided yet (show the banner). */
export type ConsentState = ConsentValue | "unset";

/** Read the consent value from a `document.cookie`-style string. */
export function parseConsentCookie(
  cookieString: string | null | undefined,
): ConsentState {
  if (!cookieString) return "unset";
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== CONSENT_COOKIE) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    return value === "granted" || value === "denied" ? value : "unset";
  }
  return "unset";
}

/** Serialize a `document.cookie` assignment string for a consent choice. */
export function serializeConsentCookie(value: ConsentValue): string {
  return `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax`;
}

export function isConsentGranted(state: ConsentState): boolean {
  return state === "granted";
}
