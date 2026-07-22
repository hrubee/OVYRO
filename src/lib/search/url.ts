/**
 * Absolute-URL helpers for canonical links and OpenGraph/Twitter tags
 * (spec §4.2.1 "SSR, OpenGraph tags"; R-8 SEO). The public origin is
 * `NEXT_PUBLIC_APP_URL`; without it we fall back to localhost so builds and
 * tests never depend on the env being set.
 */
const FALLBACK_ORIGIN = "http://localhost:3000";

/** The configured public origin, trailing slashes stripped. */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (raw && raw.length > 0 ? raw : FALLBACK_ORIGIN).replace(/\/+$/, "");
}

/** Join a path onto the public origin, yielding an absolute URL. */
export function absoluteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${suffix}`;
}

/** Canonical path for a listing landing page. */
export function listingPath(slug: string): string {
  return `/land/${slug}`;
}

/** Canonical absolute URL for a listing landing page (Meta ad destination). */
export function listingUrl(slug: string): string {
  return absoluteUrl(listingPath(slug));
}
