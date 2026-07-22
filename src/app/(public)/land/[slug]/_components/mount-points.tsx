import { Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InquiryPanel,
  type InquiryPanelListing,
} from "@/components/listings/inquiry";

/**
 * Phase 2 mount points (spec §4.2.2 inquiry/negotiation, §4.2.3 saved lists).
 *
 * The landing-page layout was finalized here first so it does not shift as the
 * real lead/inquiry form and saved-lists actions land — each owned by a
 * different builder. The inquiry slot is now live: it delegates to
 * `InquiryPanel`, which gates on auth + phone verification server-side. The
 * save-button slot below stays a placeholder until its builder wires it.
 */
export function InquiryMountPoint({ listing }: { listing: InquiryPanelListing }) {
  return <InquiryPanel listing={listing} />;
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
