import { getOwnerPixelId } from "@/app/api/dashboard/marketing/_lib/repo";
import { db } from "@/lib/db";
import { MetaPixel } from "./meta-pixel";

export interface PixelMountListing {
  id: string;
  /** The listing owner — the ONLY seller whose pixel may fire here (R-4). */
  sellerId: string;
  price: number;
  currency: string;
}

/**
 * Server mount for the public listing landing page (spec §5.2, R-4). Resolves
 * the listing OWNER's pixel id and hands it to the client {@link MetaPixel}. It
 * renders the client component even when there is no pixel — MetaPixel no-ops —
 * so accepting cookie consent can turn it on without a server round-trip.
 *
 * A failed pixel lookup must never break the page, so the read is best-effort.
 */
export async function PixelMount({ listing }: { listing: PixelMountListing }) {
  let pixelId: string | null = null;
  try {
    pixelId = await getOwnerPixelId(db, listing.sellerId);
  } catch {
    pixelId = null; // no pixel rather than a broken landing page
  }

  return (
    <MetaPixel
      pixelId={pixelId}
      listingId={listing.id}
      value={listing.price}
      currency={listing.currency}
    />
  );
}
