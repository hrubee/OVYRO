/**
 * A single saved list (spec §4.2.3). Auth-gated on "is signed in"; a list that
 * is not the caller's resolves to a 404 (never 403), so a buyer cannot probe for
 * the existence of another user's lists.
 *
 *   PATCH  /api/me/lists/<id>  { name }  → rename a custom list.
 *   DELETE /api/me/lists/<id>            → delete a custom list (items cascade).
 *
 * The default wishlist is immutable → 409 DEFAULT_LIST_IMMUTABLE.
 */
import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteList, renameList, renameListSchema, serializeList } from "@/lib/lists";
import { NotFoundError, handleRoute, ok, readJson } from "../../_lib/http";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { id } = await params;

    const { name } = renameListSchema.parse(await readJson(req));
    const row = await renameList(db, actor.userId, id, name);
    if (!row) throw new NotFoundError("That list doesn't exist.");
    return ok(serializeList(row, 0));
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { id } = await params;

    const deleted = await deleteList(db, actor.userId, id);
    if (!deleted) throw new NotFoundError("That list doesn't exist.");
    return ok({ id, deleted: true });
  });
}
