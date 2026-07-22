/**
 * PATCH /api/dashboard/media/reorder
 *
 * Seller-gated. Body carries the full ordered list of the listing's media ids;
 * `sort_order` is rewritten 0..n-1 to match. The first entry (sort_order 0) is
 * the cover (spec §4.3.1) — the serializers derive the cover from sort order,
 * so no separate cover flag is needed.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingMedia } from "@/lib/db/schema";
import { serializeMedia } from "@/lib/listings";
import {
  MediaError,
  errorResponse,
  loadOwnedListing,
  reorderSchema,
} from "../shared";

export const runtime = "nodejs";

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireActorWithRole("seller");
    const body = reorderSchema.parse(await request.json());

    await loadOwnedListing(actor.userId, body.listingId);

    const rows = await db
      .select({ id: listingMedia.id })
      .from(listingMedia)
      .where(eq(listingMedia.listingId, body.listingId));
    const ownedIds = new Set(rows.map((row) => row.id));

    // The order must be an exact permutation of this listing's media.
    const isPermutation =
      body.order.length === rows.length &&
      body.order.every((id) => ownedIds.has(id));
    if (!isPermutation) {
      throw new MediaError(
        "invalid_order",
        "Order must list each of the listing's media exactly once.",
        422,
      );
    }

    await db.transaction(async (tx) => {
      await Promise.all(
        body.order.map((id, index) =>
          tx
            .update(listingMedia)
            .set({ sortOrder: index })
            .where(
              and(eq(listingMedia.id, id), eq(listingMedia.listingId, body.listingId)),
            ),
        ),
      );
    });

    const updated = await db
      .select()
      .from(listingMedia)
      .where(eq(listingMedia.listingId, body.listingId))
      .orderBy(listingMedia.sortOrder);

    return NextResponse.json({ media: updated.map(serializeMedia) });
  } catch (error) {
    return errorResponse(error);
  }
}
