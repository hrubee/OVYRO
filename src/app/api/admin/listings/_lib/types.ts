/**
 * Wire shape for the admin moderation queue. Kept in its own module (no DB, no
 * queue imports) so the client `moderation-table` component can `import type` it
 * without dragging server-only code into the browser bundle.
 */
import type { AreaUnit, LandType, ListingStatus } from "@/lib/listings";

export interface ModerationListing {
  id: string;
  slug: string;
  title: string;
  status: ListingStatus;
  price: number;
  currency: string;
  landType: LandType;
  area: number;
  areaUnit: AreaUnit;
  city: string | null;
  region: string | null;
  /** Seller identity, joined in so the reviewer can see who submitted it. */
  seller: { id: string; name: string; email: string };
  createdAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  /** Owner/admin-only moderation feedback; only set once rejected. */
  rejectedReason: string | null;
}
