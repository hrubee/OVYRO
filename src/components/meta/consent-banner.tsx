"use client";

import { Button } from "@/components/ui/button";
import { useConsent } from "./consent-provider";

/**
 * Cookie-consent banner (spec §5.2). Visible only while the visitor has not
 * decided; a seller's Meta Pixel loads only after "Accept". Once a choice is
 * stored it never shows again (the cookie persists the decision).
 */
export function ConsentBanner() {
  const { state, ready, accept, decline } = useConsent();

  // Nothing until we've read the cookie, and nothing once a choice is made.
  if (!ready || state !== "unset") return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use cookies to measure ad performance for the landowners advertising
          on Ovyro. You can accept or decline marketing cookies.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={decline}>
            Decline
          </Button>
          <Button size="sm" onClick={accept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
