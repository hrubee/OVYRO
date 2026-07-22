/**
 * POST /api/admin/seller-onboarding/[id]/reject  (spec §4.2.4)
 *
 * Reject a submitted seller application with a note (emailed to the applicant).
 * Body: `{ "note": string }`. Admin-gated; non-admins get 403.
 */
import { NextResponse } from "next/server";
import { requireActorWithRole } from "@/lib/auth/session";
import { jsonError } from "../../_lib/http";
import { rejectInputSchema, rejectOnboarding } from "../../_lib/review";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActorWithRole("admin");
    const { id } = await params;
    // Tolerate an empty/invalid body: schema.parse then surfaces a 400, not a 500.
    const raw = await request.json().catch(() => ({}));
    const { note } = rejectInputSchema.parse(raw);
    const submission = await rejectOnboarding(actor, id, note);
    return NextResponse.json({ submission });
  } catch (error) {
    return jsonError(error);
  }
}
