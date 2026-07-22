/**
 * GET /api/admin/seller-onboarding?state=submitted  (spec §4.2.4)
 *
 * The seller-application review queue. Admin-gated; defaults to `submitted`
 * (the primary review job) and accepts any onboarding state for inspecting
 * approved/rejected history. Non-admins get 403.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActorWithRole } from "@/lib/auth/session";
import { ONBOARDING_STATES } from "@/lib/onboarding";
import { jsonError } from "./_lib/http";
import { listOnboardingSubmissions } from "./_lib/queries";

export const dynamic = "force-dynamic";

const stateSchema = z.enum(ONBOARDING_STATES);

export async function GET(request: NextRequest) {
  try {
    await requireActorWithRole("admin");

    const raw = request.nextUrl.searchParams.get("state");
    const state = raw === null ? undefined : stateSchema.parse(raw);

    const submissions = await listOnboardingSubmissions({ state });
    return NextResponse.json({ submissions });
  } catch (error) {
    return jsonError(error);
  }
}
