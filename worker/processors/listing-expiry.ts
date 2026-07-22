import type { Job } from "bullmq";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, users } from "@/lib/db/schema";
import { assertTransition, type ListingStatus } from "@/lib/listings";
import { enqueue, getQueue, parseJobPayload } from "@/lib/queue";
import { listingExpiredEmail, listingUrl } from "@/lib/email/templates";
import { describeError, logger } from "../logger";

/**
 * `listing-expiry` queue — listing lifecycle (spec §4.3.1, §8).
 *
 * Two jobs:
 *   - `sweep`         : repeatable tick; flips every overdue `active` listing to
 *                       `expired` and sends each seller a renew prompt.
 *   - `expire-listing`: expire a single listing by id (targeted enqueue path).
 *
 * The `active -> expired` edge is validated against the core state machine so a
 * future change to the transition graph fails loudly here rather than letting an
 * illegal move slip through a bare UPDATE.
 */

const EXPIRED: ListingStatus = "expired";

type ExpiredRow = { id: string; sellerId: string; slug: string; title: string };

/** Pure predicate: an active listing past its (non-null) expiry is overdue. */
export function isOverdue(
  row: { status: ListingStatus; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    row.status === "active" &&
    row.expiresAt !== null &&
    row.expiresAt.getTime() <= now.getTime()
  );
}

/**
 * Flip every overdue active listing to `expired` in a single race-safe UPDATE
 * (concurrent sweeps can't double-process a row), then queue renew prompts for
 * the sellers whose listings expired. Returns the expired listing ids.
 */
export async function expireOverdueListings(now: Date = new Date()): Promise<string[]> {
  assertTransition("active", EXPIRED);

  // `lte(expiresAt, now)` already excludes NULL expiries; the isNull(deletedAt)
  // guard keeps soft-deleted rows out.
  const expired = await db
    .update(listings)
    .set({ status: EXPIRED })
    .where(
      and(
        eq(listings.status, "active"),
        isNull(listings.deletedAt),
        lte(listings.expiresAt, now),
      ),
    )
    .returning({
      id: listings.id,
      sellerId: listings.sellerId,
      slug: listings.slug,
      title: listings.title,
    });

  await enqueueRenewPrompts(expired);
  return expired.map((row) => row.id);
}

/** Expire one listing by id. Idempotent: a no-op if it is not currently active. */
export async function expireListing(listingId: string): Promise<boolean> {
  const expired = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(listings)
      .where(and(eq(listings.id, listingId), isNull(listings.deletedAt)))
      .for("update");
    if (!row || row.status !== "active") return null;

    assertTransition(row.status, EXPIRED);
    await tx.update(listings).set({ status: EXPIRED }).where(eq(listings.id, listingId));
    return { id: row.id, sellerId: row.sellerId, slug: row.slug, title: row.title };
  });

  if (!expired) return false;
  await enqueueRenewPrompts([expired]);
  return true;
}

/** Best-effort renew prompts. Failure is logged, never fatal — the flip is committed. */
async function enqueueRenewPrompts(rows: ExpiredRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const sellerIds = [...new Set(rows.map((row) => row.sellerId))];
    const sellers = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, sellerIds));
    const byId = new Map(sellers.map((seller) => [seller.id, seller]));

    for (const row of rows) {
      const seller = byId.get(row.sellerId);
      if (!seller) continue;
      const email = listingExpiredEmail({
        sellerName: seller.name,
        listingTitle: row.title,
        renewUrl: listingUrl(row.slug),
      });
      await enqueue("email", "send", {
        to: seller.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }
  } catch (error) {
    logger.error("failed to enqueue renew prompts", describeError(error));
  }
}

export async function processListingExpiry(job: Job): Promise<unknown> {
  if (job.name === "sweep") {
    parseJobPayload("listing-expiry", "sweep", job.data);
    const ids = await expireOverdueListings();
    logger.info("expiry sweep complete", { jobId: job.id, expired: ids.length });
    return { expired: ids.length };
  }

  if (job.name === "expire-listing") {
    const { listingId } = parseJobPayload("listing-expiry", "expire-listing", job.data);
    const expired = await expireListing(listingId);
    logger.info("expire-listing complete", { jobId: job.id, listingId, expired });
    return { expired };
  }

  throw new Error(`Unhandled job "${job.name}" on the listing-expiry queue.`);
}

/**
 * Register the repeatable sweep. Idempotent — BullMQ dedupes a repeatable by its
 * (name, pattern), so re-running on every deploy just refreshes the schedule.
 * The cadence is `LISTING_EXPIRY_SWEEP_CRON` (default hourly). Called once at
 * worker boot.
 */
export async function scheduleExpirySweep(): Promise<void> {
  const pattern = process.env.LISTING_EXPIRY_SWEEP_CRON ?? "0 * * * *";
  await getQueue("listing-expiry").add(
    "sweep",
    {},
    { repeat: { pattern }, removeOnComplete: true, removeOnFail: { count: 50 } },
  );
  logger.info("scheduled listing-expiry sweep", { pattern });
}
