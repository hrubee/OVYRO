/**
 * Seller profile settings API (spec §4.3). Seller-gated on both verbs — a
 * signed-out caller gets 401, a signed-in non-seller 403 — via
 * `requireActorWithRole('seller')` (which honours the additive-roles rule: a
 * seller passes because seller ⊇ buyer).
 *
 *   GET /api/dashboard/profile         → the caller's seller profile, seeded
 *                                        with their account name if none exists.
 *   PUT /api/dashboard/profile { … }   → create or update the profile (upsert).
 */
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { handleRoute, ok, readJson } from "./_lib/http";
import { getSellerProfileOrDefault, upsertSellerProfile } from "./_lib/repo";
import { sellerProfileUpdateSchema } from "./_lib/schema";

export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const profile = await getSellerProfileOrDefault(db, actor.userId, actor.name);
    return ok(profile);
  });
}

export async function PUT(req: Request) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const input = sellerProfileUpdateSchema.parse(await readJson(req));
    const profile = await upsertSellerProfile(db, actor.userId, input);
    return ok(profile);
  });
}
