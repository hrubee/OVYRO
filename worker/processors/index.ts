import type { Job } from "bullmq";
import type { QueueName } from "@/lib/queue";
import { processEmail } from "./email";
import { processSystem } from "./system";

export type Processor = (job: Job) => Promise<unknown>;

export interface ProcessorRegistration {
  handler: Processor;
  /** Jobs drained in parallel per queue. Network-bound work can run wider. */
  concurrency: number;
}

/**
 * Queue -> processor registry.
 *
 * Only registered queues get a Worker at boot. `meta-capi`, `media-processing`,
 * `token-health` and `listing-expiry` have payload contracts in
 * `src/lib/queue/jobs.ts` but land their handlers with their phase (spec §13) —
 * until then jobs enqueued on them simply wait, they are not dropped.
 */
export const processors: Partial<Record<QueueName, ProcessorRegistration>> = {
  email: { handler: processEmail, concurrency: 5 },
  system: { handler: processSystem, concurrency: 1 },
};

export function registeredQueues(): QueueName[] {
  return Object.keys(processors) as QueueName[];
}
