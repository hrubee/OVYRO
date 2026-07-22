/**
 * PATCH /api/admin/settings/flags/[key]  (spec §4.1.6, §7)
 *
 * Toggle one feature flag. Body: `{ "enabled": boolean }`. Admin-gated;
 * an unknown flag key is a 404, non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { jsonError } from "../../_lib/http";
import { flagToggleSchema, setFlag } from "../../_lib/service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { key } = await params;
    const raw = await request.json().catch(() => ({}));
    const { enabled } = flagToggleSchema.parse(raw);
    const flag = await setFlag(actor, key, enabled);
    return NextResponse.json({ flag });
  } catch (error) {
    return jsonError(error);
  }
}
