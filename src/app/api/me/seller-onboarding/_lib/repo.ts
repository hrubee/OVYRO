/**
 * Data access + state guards for the seller-onboarding application (spec §4.2.4,
 * §6). The one `seller_onboarding` row per user (enforced by the unique index on
 * `user_id`) is created lazily on the first write; a read never creates one.
 *
 * Every state change is gated through the shared state machine
 * (`@/lib/onboarding`), so an illegal move is a 409 rather than a silently
 * corrupt row — the same contract the admin review surface reads against.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sellerOnboarding } from "@/lib/db/schema";
import { assertTransition, type OnboardingRow } from "@/lib/onboarding";
import type { OnboardingStepInput, OnboardingSubmitInput } from "@/lib/onboarding";
import { AlreadyOnboardedError, OnboardingLockedError } from "./errors";
import { buildStepPatch, buildSubmitValues } from "./mapping";

/** A Drizzle db or an open transaction — the writes below run under either. */
type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The caller's onboarding row, or `null` when they have never started. */
export async function getOnboarding(
  db: Db,
  userId: string,
): Promise<OnboardingRow | null> {
  const [row] = await db
    .select()
    .from(sellerOnboarding)
    .where(eq(sellerOnboarding.userId, userId))
    .limit(1);
  return row ?? null;
}

async function selectForUser(
  tx: Executor,
  userId: string,
): Promise<OnboardingRow | null> {
  const [row] = await tx
    .select()
    .from(sellerOnboarding)
    .where(eq(sellerOnboarding.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Persist a mid-wizard step. Creates the row on first save (state defaults to
 * `in_progress`); on an existing row it merges the patch and keeps the state
 * `in_progress`. A `rejected` application is reopened for another pass
 * (`rejected → in_progress`, clearing the stale review note) — this is the
 * "edit + resubmit" entry point. A `submitted` application is locked, and an
 * `approved` one means they are already a seller.
 */
export async function saveStep(
  db: Db,
  userId: string,
  input: OnboardingStepInput,
): Promise<OnboardingRow> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const existing = await selectForUser(tx, userId);

    if (!existing) {
      const patch = buildStepPatch(input, null, now);
      const [row] = await tx
        .insert(sellerOnboarding)
        .values({ userId, ...patch })
        .returning();
      return row!;
    }

    if (existing.state === "approved") throw new AlreadyOnboardedError();
    if (existing.state === "submitted") throw new OnboardingLockedError();

    const patch = buildStepPatch(
      input,
      { addressJson: existing.addressJson, termsAcceptedAt: existing.termsAcceptedAt },
      now,
    );

    if (existing.state === "rejected") {
      assertTransition("rejected", "in_progress");
      patch.state = "in_progress";
      patch.reviewNote = null;
      patch.reviewedBy = null;
      patch.submittedAt = null;
    }

    const [row] = await tx
      .update(sellerOnboarding)
      .set(patch)
      .where(eq(sellerOnboarding.id, existing.id))
      .returning();
    return row!;
  });
}

/**
 * Submit the completed application for review. The move is gated by
 * `assertTransition(current, "submitted")`, so only an `in_progress` application
 * can submit: `submitted` (double-submit), `rejected` (must edit to reopen
 * first) and `approved` all raise a 409. `submitted_at` and the terms-acceptance
 * timestamp are stamped at this legally-binding moment.
 */
export async function submitApplication(
  db: Db,
  userId: string,
  input: OnboardingSubmitInput,
): Promise<OnboardingRow> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const existing = await selectForUser(tx, userId);
    const currentState = existing?.state ?? "in_progress";
    assertTransition(currentState, "submitted");

    const values = buildSubmitValues(input, now);

    if (!existing) {
      const [row] = await tx
        .insert(sellerOnboarding)
        .values({ userId, ...values })
        .returning();
      return row!;
    }

    const [row] = await tx
      .update(sellerOnboarding)
      .set(values)
      .where(eq(sellerOnboarding.id, existing.id))
      .returning();
    return row!;
  });
}
