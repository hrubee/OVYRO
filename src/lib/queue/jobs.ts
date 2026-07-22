import { z } from "zod";

/**
 * The single source of truth for every async job in Ovyro.
 *
 * Per CLAUDE.md the web app stays stateless: route handlers only ever *enqueue*
 * from this registry, and the `worker` service is the only place processors run.
 *
 * Queues listed in spec §8 land here now; processors for the later phases
 * (meta-capi, media-processing, token-health, listing-expiry) arrive with their
 * phase, but the payload contract is fixed at this commit so producers can be
 * written against it.
 */
export const jobSchemas = {
  /** Transactional email dispatch (Resend). */
  email: {
    send: z.object({
      to: z.union([z.email(), z.array(z.email()).min(1)]),
      subject: z.string().min(1),
      html: z.string().min(1),
      text: z.string().optional(),
      replyTo: z.email().optional(),
    }),
  },

  /** Server-side Meta Conversions API events for a seller's own pixel. */
  "meta-capi": {
    "dispatch-event": z.object({
      sellerId: z.string().min(1),
      listingId: z.string().min(1),
      /** Shared with the browser pixel for deduplication. */
      eventId: z.string().min(1),
      eventName: z.string().min(1),
      eventTimeMs: z.number().int().positive(),
      sourceUrl: z.url(),
      /** Pre-hashed user data; raw PII must never reach the queue. */
      userData: z.record(z.string(), z.string()).default({}),
      customData: z.record(z.string(), z.unknown()).optional(),
    }),
  },

  /** Post-upload media work, kept out of the request path. */
  "media-processing": {
    "image-variants": z.object({
      mediaId: z.string().min(1),
      listingId: z.string().min(1),
      r2Key: z.string().min(1),
    }),
    "video-ingest": z.object({
      mediaId: z.string().min(1),
      listingId: z.string().min(1),
      r2Key: z.string().min(1),
    }),
  },

  /** Periodic validity checks on stored (encrypted) Meta tokens. */
  "token-health": {
    "check-meta-token": z.object({
      sellerId: z.string().min(1),
    }),
    /** Fan-out tick: enumerates sellers and enqueues `check-meta-token`. */
    sweep: z.object({}),
  },

  /** Listing lifecycle transitions. */
  "listing-expiry": {
    "expire-listing": z.object({
      listingId: z.string().min(1),
    }),
    /** Fan-out tick: finds listings past their expiry and enqueues `expire-listing`. */
    sweep: z.object({}),
  },

  /** Nightly rollup of `analytics_events` into `metrics_daily` (spec §10). */
  "metrics-rollup": {
    /** Roll up one UTC day — idempotent upsert on (date, metric, dimension). */
    "rollup-day": z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    }),
    /** Manual backfill: fan out a `rollup-day` per day in [start, end] inclusive. */
    backfill: z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    }),
    /** Repeatable nightly tick: rolls up the just-completed UTC day. */
    sweep: z.object({}),
  },

  /** Infrastructure jobs — liveness probes and the end-to-end queue smoke test. */
  system: {
    echo: z.object({
      message: z.string().min(1),
    }),
  },
} as const;

export type JobSchemas = typeof jobSchemas;

export type QueueName = keyof JobSchemas;

export type JobName<Q extends QueueName> = keyof JobSchemas[Q] & string;

export type JobPayload<
  Q extends QueueName,
  J extends JobName<Q>,
> = JobSchemas[Q][J] extends z.ZodType<infer Output> ? Output : never;

export const QUEUE_NAMES = Object.keys(jobSchemas) as QueueName[];

export function getJobSchema<Q extends QueueName, J extends JobName<Q>>(
  queue: Q,
  job: J,
): z.ZodType<JobPayload<Q, J>> {
  const schema = jobSchemas[queue][job];
  if (!schema) {
    throw new Error(`Unknown job "${String(job)}" on queue "${queue}".`);
  }
  // TS cannot see that the indexed schema produces `JobPayload<Q, J>` while Q
  // and J are still generic; the registry above is what makes it true.
  return schema as unknown as z.ZodType<JobPayload<Q, J>>;
}

/**
 * Validates a payload against its schema. Producers get this for free via
 * `enqueue`; processors call it on the way out of Redis, because a job may have
 * been enqueued by an older deploy with a different shape.
 */
export function parseJobPayload<Q extends QueueName, J extends JobName<Q>>(
  queue: Q,
  job: J,
  payload: unknown,
): JobPayload<Q, J> {
  return getJobSchema(queue, job).parse(payload);
}
