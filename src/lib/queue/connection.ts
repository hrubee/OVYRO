import IORedis, { type Redis, type RedisOptions } from "ioredis";

/**
 * Shared ioredis connection for BullMQ (queues in `web`, workers in `worker`).
 *
 * BullMQ requires `maxRetriesPerRequest: null` on any connection a Worker uses —
 * blocking commands (BRPOPLPUSH) outlive the default retry budget and ioredis
 * would otherwise abort them. We use the same options for producers so a single
 * connection can be shared by both roles.
 */
const BULLMQ_REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

let connection: Redis | null = null;

/** Reads REDIS_URL at call time (not module load) so importing this file is side-effect free. */
export function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. Queues and the worker service both require Redis — see .env.example.",
    );
  }
  return url;
}

/** Process-wide singleton. Every queue and worker shares it; BullMQ multiplexes internally. */
export function getRedisConnection(): Redis {
  connection ??= createRedisConnection();
  return connection;
}

/** Fresh connection, not the singleton. Used by tests and by short-lived scripts. */
export function createRedisConnection(url: string = getRedisUrl()): Redis {
  return new IORedis(url, BULLMQ_REDIS_OPTIONS);
}

export async function closeRedisConnection(): Promise<void> {
  if (!connection) return;
  const open = connection;
  connection = null;
  await open.quit();
}
