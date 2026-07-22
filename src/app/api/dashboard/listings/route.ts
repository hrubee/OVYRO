/**
 * Seller listings collection — `GET` (own listings) and `POST` (create draft).
 * Both are seller-gated (spec §7); anonymous → 401, non-seller → 403.
 */
import type { NextRequest } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingCreateSchema, serialize, serializeSummary } from "@/lib/listings";
import { handleRoute, ok, readJson } from "./_lib/http";
import {
  createSellerListing,
  listCoverPhotos,
  listSellerListings,
} from "./_lib/repo";

export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");

    const rows = await listSellerListings(db, actor.userId);
    const covers = await listCoverPhotos(
      db,
      rows.map((row) => row.id),
    );
    const data = rows.map((row) =>
      serializeSummary(row, covers.get(row.id) ?? null),
    );
    return ok(data);
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");

    const input = listingCreateSchema.parse(await readJson(req));
    const row = await createSellerListing(db, actor.userId, input);
    return ok(serialize(row), 201);
  });
}
