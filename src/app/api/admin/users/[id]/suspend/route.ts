/**
 * POST /api/admin/users/[id]/suspend  (spec §4.1.2)
 *
 * Suspend a user: sets `users.status = suspended` and writes an audit row. A
 * suspended user cannot sign in (spec §14). Admin-gated; an admin cannot suspend
 * their own account (400).
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { suspendUser } from "../../_lib/actions";
import { jsonError } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    const result = await suspendUser(actor, id);
    return NextResponse.json({ user: result });
  } catch (error) {
    return jsonError(error);
  }
}
