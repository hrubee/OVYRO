import { Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InquiryPanel,
  type InquiryPanelListing,
} from "@/components/listings/inquiry";
import { SaveButton } from "@/components/lists/save-button";

/**
 * Phase 2 mount points (spec §4.2.2 inquiry/negotiation, §4.2.3 saved lists).
 *
 * The landing-page layout was finalized here first so it does not shift as the
 * real lead/inquiry form and saved-lists actions land — each owned by a
 * different builder. Both slots are now live: the inquiry slot delegates to
 * `InquiryPanel`, which gates on auth + phone verification server-side; the
 * save slot renders the real save-to-list control (auth-gated; anonymous users
 * hit the signup wall) when given a `listingId`, and degrades to the disabled
 * placeholder without one.
 */
export function InquiryMountPoint({ listing }: { listing: InquiryPanelListing }) {
  return <InquiryPanel listing={listing} />;
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
