/**
 * Saved lists collection (spec §4.2.3). Both handlers are auth-gated on "is
 * signed in" — never a role check (spec §3.1) — so any registered user (buyer
 * or seller) can keep lists; anonymous callers get a 401 and the client sends
 * them to the signup wall.
 *
 *   GET  /api/me/lists                → the caller's lists (default wishlist
 *                                        auto-created), each with an item count.
 *        /api/me/lists?listingId=<id> → also returns `savedListIds`: which of
 *                                        those lists already hold that listing.
 *   POST /api/me/lists  { name }      → create a custom named list.
 */
import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  createList,
  createListSchema,
  getSavedListIdsForListing,
  listUserLists,
  serializeList,
} from "@/lib/lists";
import { handleRoute, ok, readJson } from "../_lib/http";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();

    const lists = await listUserLists(db, actor.userId);
    const listingId = req.nextUrl.searchParams.get("listingId");
    const savedListIds = listingId
      ? await getSavedListIdsForListing(db, actor.userId, listingId)
      : undefined;

    return ok({ lists, savedListIds });
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();

    const { name } = createListSchema.parse(await readJson(req));
    const row = await createList(db, actor.userId, name);
    return ok(serializeList(row, 0), 201);
  });
}
