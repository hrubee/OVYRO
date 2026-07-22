/**
 * Submit a completed seller application for review (spec §4.2.4).
 *
 *   POST /api/me/seller-onboarding/submit { …complete application }
 *
 * Validates the whole application against the strict submit schema, then moves
 * the row `in_progress → submitted` through the shared state machine and stamps
 * `submitted_at`. An already-seller is refused (409 ALREADY_ONBOARDED); a
 * double-submit or a not-yet-reopened rejection is a 409 INVALID_TRANSITION.
 *
 * Submitting does NOT grant the seller role — an admin approving the resulting
 * `submitted` row does (spec §4.2.4). This endpoint owns the write + transition;
 * the admin review surface owns approval + the role grant.
 */
import { requireActor } from "@/lib/auth/session";
import { isSeller } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { onboardingSubmitSchema } from "@/lib/onboarding";
import { handleRoute, ok, readJson } from "../../_lib/http";
import { toBuyerDTO } from "../_lib/dto";
import { AlreadyOnboardedError } from "../_lib/errors";
import { submitApplication } from "../_lib/repo";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const actor = await requireActor();
    if (isSeller(actor.roles)) throw new AlreadyOnboardedError();

    const input = onboardingSubmitSchema.parse(await readJson(req));
    const row = await submitApplication(db, actor.userId, input);
    return ok(toBuyerDTO(row));
  });
}
