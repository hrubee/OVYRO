/**
 * Seller marketing settings API (spec §5.2) — the seller's own Meta Pixel id.
 * Seller-gated on every verb via `requireActorWithRole('seller')` (401 when
 * anonymous, 403 when a signed-in non-seller). No OAuth, no tokens, no CAPI.
 *
 *   GET    /api/dashboard/marketing            → the caller's pixel settings
 *   PUT    /api/dashboard/marketing { pixelId } → save / update the pixel id
 *   DELETE /api/dashboard/marketing            → remove the pixel (stop firing)
 */
import { requireActorWithRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { handleRoute, ok, readJson } from "./_lib/http";
import {
  disablePixel,
  getMetaMarketingSettings,
  savePixelId,
} from "./_lib/repo";
import { metaPixelUpdateSchema } from "./_lib/schema";

export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    return ok(await getMetaMarketingSettings(db, actor.userId));
  });
}

export async function PUT(req: Request) {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    const input = metaPixelUpdateSchema.parse(await readJson(req));
    return ok(await savePixelId(db, actor.userId, input.pixelId));
  });
}

export async function DELETE() {
  return handleRoute(async () => {
    const actor = await requireActorWithRole("seller");
    return ok(await disablePixel(db, actor.userId));
  });
}
