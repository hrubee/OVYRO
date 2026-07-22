/**
 * Admin seller-onboarding write service (spec §4.2.4, §3.1).
 *
 * `approveOnboarding` / `rejectOnboarding` each run one transaction that: locks
 * the application row, routes the state change through the onboarding machine
 * (via `planApproval` / `planRejection`), applies the column patch, and writes
 * an `admin_audit_log` row with a before/after snapshot (spec §10 / §6).
 *
 * Approval additionally grants the `seller` role by inserting into `user_roles`
 * *inside the same transaction* — so the role and the state change commit or
 * roll back together — and is idempotent: the join table's composite PK makes a
 * repeat grant a no-op (the buyer role is untouched; roles are additive, never a
 * column — spec §3.1). The applicant notification is enqueued *after* commit —
 * email is retryable queue work and must never hold a DB transaction open or
 * roll back a completed decision.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  adminAuditLog,
  sellerOnboarding,
  userRoles,
  users,
} from "@/lib/db/schema";
import { enqueue } from "@/lib/queue";
import { NotFoundError } from "./http";
import {
  sellerOnboardingApprovedEmail,
  sellerOnboardingRejectedEmail,
  type RenderedEmail,
} from "./emails";
import { planApproval, planRejection, reviewSnapshot } from "./plan";
import { toSubmission } from "./queries";
import type { AdminOnboardingSubmission, OnboardingApplicant } from "./types";

/** POST body for a rejection — a non-empty, bounded note shown to the applicant. */
export const rejectInputSchema = z.object({
  note: z.string().trim().min(1, "A review note is required.").max(1000),
});

export type RejectInput = z.infer<typeof rejectInputSchema>;

/**
 * Best-effort applicant notification. A Redis hiccup must not turn a committed
 * decision into a 500 — the state change is the source of truth and the email
 * is retryable; log and move on.
 */
async function notifyApplicant(to: string, email: RenderedEmail): Promise<void> {
  try {
    await enqueue("email", "send", {
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    console.error(
      "[admin/seller-onboarding] failed to enqueue applicant email",
      error,
    );
  }
}

/** Approve a submitted application: grant the additive seller role, email the applicant. */
export async function approveOnboarding(
  actor: Actor,
  id: string,
): Promise<AdminOnboardingSubmission> {
  const { updated, applicant } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(sellerOnboarding)
      .where(eq(sellerOnboarding.id, id))
      .for("update");
    if (!row) throw new NotFoundError("Seller application not found.");

    const patch = planApproval(row.state, actor.userId);
    const [next] = await tx
      .update(sellerOnboarding)
      .set(patch)
      .where(eq(sellerOnboarding.id, id))
      .returning();

    // Grant the additive `seller` role. Idempotent (composite PK) and additive —
    // the applicant keeps `buyer`; approval never touches a role column (spec §3.1).
    await tx
      .insert(userRoles)
      .values({ userId: row.userId, role: "seller" })
      .onConflictDoNothing();

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: "seller_onboarding.approve",
      entityType: "seller_onboarding",
      entityId: id,
      beforeJsonb: reviewSnapshot(row),
      afterJsonb: reviewSnapshot(next!),
    });

    const [applicantRow] = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.userId));

    return { updated: next!, applicant: applicantRow };
  });

  if (applicant?.email) {
    await notifyApplicant(
      applicant.email,
      sellerOnboardingApprovedEmail({ applicantName: applicant.name }),
    );
  }

  return toSubmission(updated, applicant ?? unknownApplicant(updated.userId));
}

/** Reject a submitted application: record the reviewer's note, email the applicant. */
export async function rejectOnboarding(
  actor: Actor,
  id: string,
  note: string,
): Promise<AdminOnboardingSubmission> {
  const { updated, applicant } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(sellerOnboarding)
      .where(eq(sellerOnboarding.id, id))
      .for("update");
    if (!row) throw new NotFoundError("Seller application not found.");

    const patch = planRejection(row.state, actor.userId, note);
    const [next] = await tx
      .update(sellerOnboarding)
      .set(patch)
      .where(eq(sellerOnboarding.id, id))
      .returning();

    await tx.insert(adminAuditLog).values({
      adminId: actor.userId,
      action: "seller_onboarding.reject",
      entityType: "seller_onboarding",
      entityId: id,
      beforeJsonb: reviewSnapshot(row),
      afterJsonb: reviewSnapshot(next!),
    });

    const [applicantRow] = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.userId));

    return { updated: next!, applicant: applicantRow };
  });

  if (applicant?.email) {
    await notifyApplicant(
      applicant.email,
      sellerOnboardingRejectedEmail({ applicantName: applicant.name, note }),
    );
  }

  return toSubmission(updated, applicant ?? unknownApplicant(updated.userId));
}

/** Placeholder for the (practically impossible) missing-user race after a locked update. */
function unknownApplicant(id: string): OnboardingApplicant {
  return { id, name: "Unknown applicant", email: "" };
}
