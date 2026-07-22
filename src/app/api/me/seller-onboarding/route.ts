/**
 * Buyer → seller onboarding progress (spec §4.2.4). Auth-gated on "is signed
 * in", never a role check (spec §3.1) — any registered buyer can apply.
 *
 *   GET  /api/me/seller-onboarding        → { isSeller, onboarding|null }.
 *   POST /api/me/seller-onboarding { …fields } → save a wizard step (upsert,
 *        stays `in_progress`; reopens a `rejected` application for editing).
 *
 * A caller who already holds the `seller` role has nothing to onboard: GET tells
 * them so via `isSeller`, and POST refuses with 409 ALREADY_ONBOARDED. The
 * application row here is *not* what grants the seller role — admin approval is
 * (spec §4.2.4); this endpoint only writes the row and its `in_progress` state.
 */
import { requireActor } from "@/lib/auth/session";
import { isSeller } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { onboardingStepSchema } from "@/lib/onboarding";
import { handleRoute, ok, readJson } from "../_lib/http";
import { toBuyerDTO, type OnboardingProgressDTO } from "./_lib/dto";
import { AlreadyOnboardedError } from "./_lib/errors";
import { getOnboarding, saveStep } from "./_lib/repo";

export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    const row = await getOnboarding(db, actor.userId);
    const progress: OnboardingProgressDTO = {
      isSeller: isSeller(actor.roles),
      onboarding: row ? toBuyerDTO(row) : null,
    };
    return ok(progress);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const actor = await requireActor();
    if (isSeller(actor.roles)) throw new AlreadyOnboardedError();

    const input = onboardingStepSchema.parse(await readJson(req));
    const row = await saveStep(db, actor.userId, input);
    return ok(toBuyerDTO(row));
  });
}
