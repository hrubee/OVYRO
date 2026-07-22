/**
 * Seller status transitions — `POST /api/dashboard/listings/[id]/status`.
 *
 * The body names the target status; every move is validated through the shared
 * state machine + seller policy (`resolveSellerTransition`), so illegal moves
 * are 409, admin/worker-only moves are 403, and entering review without a photo
 * is 422. Photos are counted from `listing_media` (read-only) only when needed.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { LISTING_STATUSES, serialize } from "@/lib/listings";
import { NotFoundError, handleRoute, ok, readJson } from "../../_lib/http";
import {
  countListingPhotos,
  getSellerListing,
  setListingStatus,
} from "../../_lib/repo";
import { resolveSellerTransition } from "../../_lib/transitions";

const statusBody = z.object({ to: z.enum(LISTING_STATUSES) }).strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const { id } = await params;
    const { to } = statusBody.parse(await readJson(req));

    const listing = await getSellerListing(db, actor.userId, id);
    if (!listing) throw new NotFoundError("Listing not found.");

    // Only reach for the media table when a photo count could matter.
    const photoCount =
      to === "pending_review" ? await countListingPhotos(db, id) : 0;
    resolveSellerTransition(listing.status, to, { photoCount });

    const updated = await setListingStatus(db, actor.userId, id, to, {
      clearRejectedReason: to === "pending_review",
    });
    if (!updated) throw new NotFoundError("Listing not found.");

    return ok(serialize(updated));
  });
}
