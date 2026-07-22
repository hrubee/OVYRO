import { Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Phase 2 mount points (spec §4.2.2 inquiry/negotiation, §4.2.3 saved lists).
 *
 * These are deliberately non-functional, clearly-labeled placeholders. The
 * landing-page layout is finalized now so it does not shift when the real
 * lead/inquiry form and saved-lists actions land in Phase 2 — which are owned
 * by other builders. DO NOT wire these to any endpoint here.
 */
export function InquiryMountPoint({ negotiable }: { negotiable: boolean }) {
  return (
    <section
      data-slot="inquiry-form"
      aria-label="Contact seller"
      className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
    >
      <h2 className="text-lg font-semibold">
        Contact seller{negotiable ? " or make an offer" : ""}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Send an inquiry{negotiable ? " or a price offer" : ""} to the landowner.
        Sign-in and phone verification will be required.
      </p>
      <Button className="mt-4 w-full" disabled>
        Contact seller
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Available soon</p>
      {/* Phase 2: inquiry/negotiation form mounts here (offer + message, phone-OTP verified). */}
    </section>
  );
}

export function SaveMountPoint() {
  return (
    <div className="flex gap-2">
      {/* Phase 2: save-to-list + share actions wire up here. */}
      <Button variant="outline" size="sm" disabled aria-label="Save listing" data-slot="save-button">
        <Heart className="size-4" /> Save
      </Button>
      <Button variant="outline" size="sm" disabled aria-label="Share listing">
        <Share2 className="size-4" /> Share
      </Button>
    </div>
  );
}
