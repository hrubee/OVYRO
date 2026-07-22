import type { Job } from "bullmq";
import type { QueueName } from "@/lib/queue";
import { processEmail } from "./email";
import { processMediaProcessing } from "./media-processing";
import { processListingExpiry, scheduleExpirySweep } from "./listing-expiry";
import { processMetricsRollup, scheduleMetricsRollup } from "./metrics-rollup";
import { processSystem } from "./system";

export type Processor = (job: Job) => Promise<unknown>;

export interface ProcessorRegistration {
  handler: Processor;
  /** Jobs drained in parallel per queue. Network-bound work can run wider. */
  concurrency: number;
  /**
   * Optional repeatable-job registration, invoked once at worker boot. Lets a
   * queue own its own schedule (e.g. the hourly expiry sweep) without the boot
   * code needing to know about it.
   */
  schedule?: () => Promise<void>;
}

/**
 * Queue -> processor registry.
 *
 * Only registered queues get a Worker at boot. `meta-capi` and `token-health`
 * have payload contracts in `src/lib/queue/jobs.ts` but land their handlers with
 * their phase (spec §13) — until then jobs enqueued on them simply wait, they
 * are not dropped. `media-processing` lands here in Phase 1 (photos only;
 * `video-ingest` throws until Phase 6).
 */
export const processors: Partial<Record<QueueName, ProcessorRegistration>> = {
  email: { handler: processEmail, concurrency: 5 },
  system: { handler: processSystem, concurrency: 1 },
  // Image decoding is CPU-bound; keep concurrency modest so a burst of uploads
  // does not starve the worker of cores.
  "media-processing": { handler: processMediaProcessing, concurrency: 3 },
  "listing-expiry": {
    handler: processListingExpiry,
    concurrency: 3,
    schedule: scheduleExpirySweep,
  },
  // DB-bound aggregation; a backfill fans out one job per day. Keep concurrency
  // modest so a wide backfill does not saturate the connection pool.
  "metrics-rollup": {
    handler: processMetricsRollup,
    concurrency: 2,
    schedule: scheduleMetricsRollup,
  },
};

export function registeredQueues(): QueueName[] {
  return Object.keys(processors) as QueueName[];
}

/**
 * Register every queue's repeatable jobs. Idempotent — each `schedule()` uses a
 * fixed jobId so re-running on every deploy just refreshes the schedule.
 */
export async function scheduleRepeatableJobs(): Promise<void> {
  for (const name of registeredQueues()) {
    await processors[name]!.schedule?.();
  }
}
