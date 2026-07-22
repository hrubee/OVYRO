import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Job, Worker } from "bullmq";
import IORedis from "ioredis";
import { closeQueues, enqueue, getQueue } from "@/lib/queue";
import { startWorkers, stopWorkers } from "./index";

/**
 * End-to-end proof of the enqueue -> process -> complete path against real
 * Redis, booting the same `startWorkers()` the Railway worker service runs.
 *
 * Skipped when Redis is unreachable so the suite stays green on a machine
 * without it; CI and local dev with `redis-server` running exercise it.
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function redisReachable(): Promise<boolean> {
  const probe = new IORedis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  // ioredis throws on an unhandled `error` event even when connect() rejects.
  probe.on("error", () => {});
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const available = await redisReachable();

if (!available) {
  console.warn(`[skip] Redis unreachable at ${REDIS_URL} — queue integration test skipped.`);
}

describe.skipIf(!available)("worker drains the system queue", () => {
  // Booted in beforeAll, not in the describe body: a describe callback still
  // runs when the suite is skipped, so booting inline would open Redis
  // connections that the (also skipped) afterAll never closes.
  let workers: Worker[] = [];

  beforeAll(() => {
    process.env.REDIS_URL = REDIS_URL;
    workers = startWorkers();
  });

  afterAll(async () => {
    await getQueue("system").obliterate({ force: true });
    await closeQueues();
    await stopWorkers(workers);
  });

  test("boots a worker for every registered queue", () => {
    expect(workers.map((worker) => worker.name).sort()).toEqual([
      "email",
      "listing-expiry",
      "media-processing",
      "system",
    ]);
  });

  test(
    "processes an echo job to completion",
    async () => {
      const message = `ping-${Bun.randomUUIDv7()}`;
      const systemWorker = workers.find((worker) => worker.name === "system")!;

      // Listen before enqueueing — the job can complete before `add` resolves.
      const completed = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("job did not complete in 10s")), 10_000);
        systemWorker.on("completed", (job: Job, result: unknown) => {
          if (job.data?.message !== message) return;
          clearTimeout(timer);
          resolve(result);
        });
      });

      const job = await enqueue("system", "echo", { message });
      expect(job.id).toBeDefined();

      await expect(completed).resolves.toEqual({ echoed: message });
    },
    15_000,
  );

  test("rejects an invalid payload before it reaches Redis", async () => {
    // @ts-expect-error — `message` is required; enqueue validates ahead of the network.
    await expect(enqueue("system", "echo", {})).rejects.toThrow();
  });
});
