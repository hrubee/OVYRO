/**
 * Single seller listing — `GET` (detail + media), `PATCH` (edit), `DELETE`
 * (soft-delete). Seller-gated; a listing that is not the caller's live listing
 * resolves to 404 (ownership is never disclosed as a 403).
 */
import type { NextRequest } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingEditSchema, serialize } from "@/lib/listings";
import { NotFoundError, handleRoute, ok, readJson } from "../_lib/http";
import {
  getListingMedia,
  getSellerListing,
  softDeleteSellerListing,
  updateSellerListing,
} from "../_lib/repo";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const { id } = await params;

    const row = await getSellerListing(db, actor.userId, id);
    if (!row) throw new NotFoundError("Listing not found.");

    const media = await getListingMedia(db, row.id);
    return ok(serialize(row, media));
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const { id } = await params;

    const patch = listingEditSchema.parse(await readJson(req));
    const row = await updateSellerListing(db, actor.userId, id, patch);
    if (!row) throw new NotFoundError("Listing not found.");

    const media = await getListingMedia(db, row.id);
    return ok(serialize(row, media));
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const { id } = await params;

    const row = await softDeleteSellerListing(db, actor.userId, id);
    if (!row) throw new NotFoundError("Listing not found.");

    return ok({
      id: row.id,
      deletedAt: row.deletedAt?.toISOString() ?? null,
    });
  });
}
