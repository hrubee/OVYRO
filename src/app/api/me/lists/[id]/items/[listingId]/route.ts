/**
 * Saved-list membership (spec §4.2.3). Auth-gated on "is signed in".
 *
 *   PUT    /api/me/lists/<id>/items/<listingId>  → save the listing to the list,
 *                                                  snapshotting `price_at_save`.
 *   DELETE /api/me/lists/<id>/items/<listingId>  → unsave it.
 *
 * `<id>` is either a list id or the reserved `default` token, which the save
 * button uses to hit the auto-created wishlist without first resolving its id.
 * A list that is not the caller's → 404; an unknown/removed listing → 404. PUT
 * is idempotent, so a double-save is a no-op that still reports success.
 */
import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  addItemToList,
  removeItemFromList,
  resolveListForWrite,
} from "@/lib/lists";
import { NotFoundError, handleRoute, ok } from "../../../../_lib/http";

type Params = { params: Promise<{ id: string; listingId: string }> };

export async function PUT(_req: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { id, listingId } = await params;

    const list = await resolveListForWrite(db, actor.userId, id);
    if (!list) throw new NotFoundError("That list doesn't exist.");

    const item = await addItemToList(db, list.id, listingId);
    if (!item) throw new NotFoundError("That listing is no longer available.");

    // Only the membership fact matters to the caller (it already has the
    // listing) — return the snapshot rather than re-resolving the listing.
    return ok(
      {
        listId: list.id,
        listingId,
        priceAtSave: item.priceAtSave ? Number(item.priceAtSave) : null,
        savedAt: item.createdAt.toISOString(),
      },
      201,
    );
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { id, listingId } = await params;

    const list = await resolveListForWrite(db, actor.userId, id);
    if (!list) throw new NotFoundError("That list doesn't exist.");

    const removed = await removeItemFromList(db, list.id, listingId);
    return ok({ listId: list.id, listingId, removed });
  });
}
