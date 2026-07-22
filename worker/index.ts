import { Worker } from "bullmq";
import { closeRedisConnection, getRedisConnection, getRedisUrl } from "@/lib/queue";
import { describeError, logger } from "./logger";
import { processors, registeredQueues, scheduleRepeatableJobs } from "./processors";

/**
 * Ovyro worker service entrypoint (`bun run worker`).
 *
 * Deployed as a SEPARATE Railway service from `web` (railway.worker.json). It
 * shares `/src/lib` per spec §8.2 but must never import the Next.js server
 * runtime — keeping the web app stateless means all async work lives here.
 */
export function startWorkers(): Worker[] {
  // Fail fast and loudly rather than letting ioredis retry a missing URL forever.
  getRedisUrl();
  const connection = getRedisConnection();

  const workers = registeredQueues().map((name) => {
    const { handler, concurrency } = processors[name]!;
    const worker = new Worker(name, handler, { connection, concurrency });

    worker.on("completed", (job) => {
      logger.info("job completed", { queue: name, jobId: job.id, job: job.name });
    });
    worker.on("failed", (job, error) => {
      logger.error("job failed", {
        queue: name,
        jobId: job?.id,
        job: job?.name,
        attempts: job?.attemptsMade,
        ...describeError(error),
      });
    });
    // Connection-level problems; BullMQ reconnects on its own.
    worker.on("error", (error) => {
      logger.error("worker error", { queue: name, ...describeError(error) });
    });

    return worker;
  });

  logger.info("worker started", {
    queues: registeredQueues(),
    pid: process.pid,
  });

  return workers;
}

/**
 * Graceful shutdown. `worker.close()` stops fetching new jobs and waits for the
 * active ones, so a Railway SIGTERM does not strand a half-processed job.
 */
export async function stopWorkers(workers: Worker[]): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  await closeRedisConnection();
}

function main(): void {
  const workers = startWorkers();

  // Register repeatable jobs (e.g. the hourly listing-expiry sweep). Fire and
  // forget — a scheduling hiccup must not stop the workers from draining jobs.
  scheduleRepeatableJobs().catch((error: unknown) => {
    logger.error("failed to schedule repeatable jobs", describeError(error));
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    // A second signal during a slow drain should still be able to kill us.
    if (shuttingDown) {
      logger.warn("second signal received — exiting immediately", { signal });
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("shutting down", { signal });

    stopWorkers(workers)
      .then(() => {
        logger.info("shutdown complete");
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error("shutdown failed", describeError(error));
        process.exit(1);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.main) {
  main();
}
