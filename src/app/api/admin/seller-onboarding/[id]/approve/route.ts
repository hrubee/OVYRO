/**
 * POST /api/admin/seller-onboarding/[id]/approve  (spec §4.2.4, §3.1)
 *
 * Approve a submitted seller application: the applicant gains the additive
 * `seller` role (keeping `buyer`), the decision is audit-logged, and the
 * applicant is emailed. Admin-gated; non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { jsonError } from "../../_lib/http";
import { approveOnboarding } from "../../_lib/review";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    const submission = await approveOnboarding(actor, id);
    return NextResponse.json({ submission });
  } catch (error) {
    return jsonError(error);
  }
}
