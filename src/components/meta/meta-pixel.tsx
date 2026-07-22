"use client";

import Script from "next/script";
import { useConsent } from "./consent-provider";
import { contentParams, isValidPixelId, pixelBootScript } from "./pixel-logic";

export interface MetaPixelProps {
  /**
   * The listing OWNER's pixel id, or null when they have none (spec R-4). This
   * is the ONLY pixel this component will ever fire; it is resolved server-side
   * strictly from the current listing's owner.
   */
  pixelId: string | null;
  listingId: string;
  value: number;
  currency: string;
}

/**
 * The ONE place a Meta Pixel may fire (spec §5.2, R-4). Injects nothing at all —
 * no script, no network — unless BOTH hold:
 *   1. the listing owner has a valid pixel id, and
 *   2. the visitor has granted cookie consent.
 *
 * When both hold it boots exactly that owner's pixel and fires PageView +
 * ViewContent. It never references any other seller's pixel, and it re-renders
 * reactively when consent flips (via {@link useConsent}), so accepting the
 * banner turns tracking on without a page reload.
 */
export function MetaPixel({ pixelId, listingId, value, currency }: MetaPixelProps) {
  const { granted } = useConsent();

  if (!granted) return null;
  if (!pixelId || !isValidPixelId(pixelId)) return null;

  const script = pixelBootScript(
    pixelId,
    contentParams({ listingId, value, currency }),
  );

  return (
    <Script
      id="meta-pixel"
      strategy="afterInteractive"
      // Safe: pixelBootScript validates the numeric id and JSON-escapes params.
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
