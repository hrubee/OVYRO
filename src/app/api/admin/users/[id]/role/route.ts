/**
 * POST /api/admin/users/[id]/role  (spec §4.1.2, §3.1)
 *
 * Grant or revoke the additive `seller` role as a manual admin override.
 * Body: `{ "action": "grant" | "revoke" }`. Admin-gated; non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { roleActionSchema, setSellerRole } from "../../_lib/actions";
import { jsonError } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    const raw = await request.json().catch(() => ({}));
    const { action } = roleActionSchema.parse(raw);
    const result = await setSellerRole(actor, id, action);
    return NextResponse.json({ user: result });
  } catch (error) {
    return jsonError(error);
  }
}
