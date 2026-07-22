/**
 * DELETE /api/admin/users/[id]  (spec §4.1.2)
 *
 * Soft-delete a user with GDPR-style anonymization: stamps `deleted_at`, moves
 * the account to `deleted`, and scrubs PII off the users row. An audit row keeps
 * the before/after. Admin-gated; an admin cannot delete their own account (400).
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { softDeleteUser } from "../_lib/actions";
import { jsonError } from "../_lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    const result = await softDeleteUser(actor, id);
    return NextResponse.json({ user: result });
  } catch (error) {
    return jsonError(error);
  }
}
