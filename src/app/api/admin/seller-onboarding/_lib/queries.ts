/**
 * Read-side of the seller-onboarding review queue. Kept apart from `review.ts`
 * (the write service) so the admin page can render the queue without importing
 * the queue / email producers — it only needs the DB.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sellerOnboarding, users } from "@/lib/db/schema";
import { serialize, type OnboardingRow, type OnboardingState } from "@/lib/onboarding";
import type { AdminOnboardingSubmission, OnboardingApplicant } from "./types";

/** Row + joined applicant -> the admin wire shape. */
export function toSubmission(
  row: OnboardingRow,
  applicant: OnboardingApplicant,
): AdminOnboardingSubmission {
  return {
    ...serialize(row),
    applicant: { id: applicant.id, name: applicant.name, email: applicant.email },
  };
}

export interface ListOnboardingOptions {
  /** Defaults to `submitted` — the review queue's primary job. */
  state?: OnboardingState;
  limit?: number;
}

/**
 * List applications in a given state for review, oldest submission first
 * (review the longest-waiting applicant next). Defaults to `submitted`; any
 * state is accepted so an admin can inspect approved/rejected history.
 */
export async function listOnboardingSubmissions(
  options: ListOnboardingOptions = {},
): Promise<AdminOnboardingSubmission[]> {
  const state = options.state ?? "submitted";
  const limit = options.limit ?? 100;

  const rows = await db
    .select({
      onboarding: sellerOnboarding,
      applicant: { id: users.id, name: users.name, email: users.email },
    })
    .from(sellerOnboarding)
    .innerJoin(users, eq(users.id, sellerOnboarding.userId))
    .where(eq(sellerOnboarding.state, state))
    .orderBy(asc(sellerOnboarding.submittedAt))
    .limit(limit);

  return rows.map((row) => toSubmission(row.onboarding, row.applicant));
}
