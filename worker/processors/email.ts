import type { Job } from "bullmq";
import { sendEmail } from "@/lib/email";
import { parseJobPayload } from "@/lib/queue";
import { logger } from "../logger";

/**
 * `email` queue — transactional delivery via Resend.
 *
 * No-ops (rather than failing) when RESEND_API_KEY is unset so a local or
 * preview worker drains its queue instead of accumulating dead jobs.
 */
export async function processEmail(job: Job): Promise<unknown> {
  if (job.name !== "send") {
    throw new Error(`Unhandled job "${job.name}" on the email queue.`);
  }

  const payload = parseJobPayload("email", "send", job.data);
  const result = await sendEmail(payload);

  if (!result.delivered) {
    logger.warn("email skipped — RESEND_API_KEY is not set", {
      jobId: job.id,
      subject: payload.subject,
    });
    return result;
  }

  logger.info("email sent", { jobId: job.id, messageId: result.id });
  return result;
}
