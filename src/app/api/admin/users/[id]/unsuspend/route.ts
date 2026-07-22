/**
 * POST /api/admin/users/[id]/unsuspend  (spec §4.1.2)
 *
 * Lift a suspension: returns `users.status` to `active` and writes an audit row.
 * Admin-gated; non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { unsuspendUser } from "../../_lib/actions";
import { jsonError } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    const result = await unsuspendUser(actor, id);
    return NextResponse.json({ user: result });
  } catch (error) {
    return jsonError(error);
  }
}
