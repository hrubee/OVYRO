import type { Job } from "bullmq";
import { parseJobPayload } from "@/lib/queue";
import { logger } from "../logger";

/**
 * `system` queue — infrastructure jobs.
 *
 * `echo` is the end-to-end liveness job: enqueue one and a healthy worker
 * returns the message. The queue integration test drains it to prove the
 * enqueue -> process -> complete path works against real Redis.
 */
export async function processSystem(job: Job): Promise<unknown> {
  if (job.name !== "echo") {
    throw new Error(`Unhandled job "${job.name}" on the system queue.`);
  }

  const payload = parseJobPayload("system", "echo", job.data);
  logger.info("echo", { jobId: job.id, echoed: payload.message });

  return { echoed: payload.message };
}
