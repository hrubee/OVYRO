/**
 * GET /api/admin/settings/flags  (spec §4.1.6, §7)
 *
 * Every catalog feature flag with its current stored state. Admin-gated;
 * non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { jsonError } from "../_lib/http";
import { listFlags } from "../_lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireActorWithRole("admin");
    const flags = await listFlags();
    return NextResponse.json({ flags });
  } catch (error) {
    return jsonError(error);
  }
}
