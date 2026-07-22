import { Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/lists/save-button";

/**
 * Phase 2 mount points (spec §4.2.2 inquiry/negotiation, §4.2.3 saved lists).
 *
 * The inquiry slot is still a placeholder owned by the submission builder — DO
 * NOT wire it here. The save slot is now live: given a `listingId` it renders
 * the real save-to-list control (auth-gated; anonymous users hit the signup
 * wall). It degrades to the disabled placeholder if rendered without an id.
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

export function SaveMountPoint({ listingId }: { listingId?: string }) {
  return (
    <div className="flex gap-2" data-slot="save-button">
      {listingId ? (
        <SaveButton listingId={listingId} variant="inline" />
      ) : (
        <Button variant="outline" size="sm" disabled aria-label="Save listing">
          <Heart className="size-4" /> Save
        </Button>
      )}
      {/* Share stays a placeholder — not part of the saved-lists scope. */}
      <Button variant="outline" size="sm" disabled aria-label="Share listing">
        <Share2 className="size-4" /> Share
      </Button>
    </div>
  );
}
