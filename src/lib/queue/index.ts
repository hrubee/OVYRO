import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./connection";
import {
  QUEUE_NAMES,
  getJobSchema,
  type JobName,
  type JobPayload,
  type QueueName,
} from "./jobs";

export * from "./connection";
export * from "./jobs";

/**
 * Producer-side queue access. Import this from route handlers to hand work to
 * the `worker` service — never to run the work inline.
 */
const queues = new Map<QueueName, Queue>();

/** Retry policy applied to every job unless a caller overrides it. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
};

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, queue);
  }
  return queue;
}

/**
 * Type-safe enqueue. The payload is validated against its schema *before* it
 * reaches Redis, so a malformed job fails in the request that created it rather
 * than silently exhausting retries in the worker.
 */
export async function enqueue<Q extends QueueName, J extends JobName<Q>>(
  queue: Q,
  job: J,
  payload: JobPayload<Q, J>,
  options?: JobsOptions,
) {
  const data = getJobSchema(queue, job).parse(payload);
  return getQueue(queue).add(job, data, options);
}

/** Closes every queue this process opened. Callers own the shared connection. */
export async function closeQueues(): Promise<void> {
  const open = [...queues.values()];
  queues.clear();
  await Promise.all(open.map((queue) => queue.close()));
}

export { QUEUE_NAMES };
export type { JobsOptions };
