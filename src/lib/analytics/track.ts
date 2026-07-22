import { db as defaultDb } from "@/lib/db";
import { analyticsEvents } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import type { AnalyticsEventName } from "./events";

/**
 * Server-side write path for the funnel event stream (spec §10). The
 * instrumentation builder (Phase 5 wave 2) calls {@link track} and the named
 * helpers from server actions / route handlers — never the client, so bot
 * traffic and ad-blocked browsers can't distort the numbers.
 *
 * Analytics must never break the request it is measuring, so every write is
 * wrapped: a failure is reported to the console (and thus Sentry) and
 * swallowed. Writes go straight to Postgres; when the worker service owns the
 * hot path this becomes a queue push, but the public surface stays the same.
 */

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  /** Null for anonymous traffic — public listing pages need no login. */
  userId?: string | null;
  /** Cookie-scoped id so pre-signup steps still join to the eventual user. */
  anonId?: string | null;
  listingId?: string | null;
  sellerId?: string | null;
  props?: Record<string, unknown> | null;
  occurredAt?: Date;
}

/** Optional injected executor so tests/transactions can pass their own handle. */
export interface TrackOptions {
  db?: Db;
}

export async function track(
  event: AnalyticsEventInput,
  opts: TrackOptions = {},
): Promise<void> {
  const database = opts.db ?? defaultDb;
  try {
    await database.insert(analyticsEvents).values({
      eventName: event.name,
      userId: event.userId ?? null,
      anonId: event.anonId ?? null,
      listingId: event.listingId ?? null,
      sellerId: event.sellerId ?? null,
      propsJsonb: event.props ?? null,
      ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
    });
  } catch (error) {
    console.error("[analytics] failed to record event", event.name, error);
  }
}

/**
 * Substrings that mark a request as automated. Deliberately a coarse net
 * (spec §10 asks only for "basic bot filtering" on the SSR listing_view write):
 * search/social crawlers, headless browsers, uptime pings, HTTP libraries. The
 * goal is keeping obvious non-humans out of the view funnel, not fingerprinting.
 */
const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|facebot|whatsapp|telegram|embedly|preview|scan|monitor|uptime|pingdom|headless|phantomjs|puppeteer|playwright|selenium|python-requests|curl|wget|go-http-client|axios|okhttp|libwww|httpclient|apache-httpclient|java\/|node-fetch|lighthouse|gtmetrix|pagespeed/i;

/**
 * Basic user-agent bot filter for `listing_view`. A missing/empty UA counts as
 * a bot: a real browser always sends one, so absence is a stronger automation
 * signal than any single keyword.
 */
export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim() === "") return true;
  return BOT_UA_PATTERN.test(userAgent);
}

interface ListingViewInput {
  listingId: string;
  sellerId?: string | null;
  userId?: string | null;
  anonId?: string | null;
  /** The request UA — a bot-looking value skips the write entirely. */
  userAgent?: string | null;
  props?: Record<string, unknown> | null;
  occurredAt?: Date;
}

/**
 * Record a public listing-page view, dropping obvious bots so view counts and
 * the funnel denominator aren't inflated. Returns whether the view was tracked.
 */
export async function trackListingView(
  input: ListingViewInput,
  opts: TrackOptions = {},
): Promise<boolean> {
  if (isLikelyBot(input.userAgent)) return false;
  await track(
    {
      name: "listing_view",
      listingId: input.listingId,
      sellerId: input.sellerId ?? null,
      userId: input.userId ?? null,
      anonId: input.anonId ?? null,
      props: input.props ?? null,
      occurredAt: input.occurredAt,
    },
    opts,
  );
  return true;
}

/** A funnel actor: authenticated user id and/or the pre-signup cookie id. */
interface Actor {
  userId?: string | null;
  anonId?: string | null;
}

/** Inquiry form opened (fired via the beacon endpoint, spec §10). */
export function trackInquiryStarted(
  input: Actor & {
    listingId: string;
    sellerId?: string | null;
    props?: Record<string, unknown> | null;
  },
  opts: TrackOptions = {},
): Promise<void> {
  return track(
    {
      name: "inquiry_started",
      listingId: input.listingId,
      sellerId: input.sellerId ?? null,
      userId: input.userId ?? null,
      anonId: input.anonId ?? null,
      props: input.props ?? null,
    },
    opts,
  );
}

/** Inquiry/lead submitted — the funnel conversion numerator (spec §10). */
export function trackInquirySubmitted(
  input: Actor & {
    listingId: string;
    sellerId: string;
    props?: Record<string, unknown> | null;
  },
  opts: TrackOptions = {},
): Promise<void> {
  return track(
    {
      name: "inquiry_submitted",
      listingId: input.listingId,
      sellerId: input.sellerId,
      userId: input.userId ?? null,
      anonId: input.anonId ?? null,
      props: input.props ?? null,
    },
    opts,
  );
}

/**
 * New account created. `role` lands in props so the rollup can split signups
 * into buyers vs sellers (spec §4.1.1) without a second join.
 */
export function trackSignup(
  input: {
    userId: string;
    role?: "buyer" | "seller";
    anonId?: string | null;
    props?: Record<string, unknown> | null;
  },
  opts: TrackOptions = {},
): Promise<void> {
  return track(
    {
      name: "signup",
      userId: input.userId,
      anonId: input.anonId ?? null,
      props: { role: input.role ?? "buyer", ...input.props },
    },
    opts,
  );
}

/** Seller published/created a listing. */
export function trackListingCreated(
  input: {
    listingId: string;
    sellerId: string;
    props?: Record<string, unknown> | null;
  },
  opts: TrackOptions = {},
): Promise<void> {
  return track(
    {
      name: "listing_created",
      listingId: input.listingId,
      sellerId: input.sellerId,
      userId: input.sellerId,
      props: input.props ?? null,
    },
    opts,
  );
}

/** Buyer saved a listing to a list. */
export function trackSave(
  input: Actor & {
    listingId: string;
    sellerId?: string | null;
    props?: Record<string, unknown> | null;
  },
  opts: TrackOptions = {},
): Promise<void> {
  return track(
    {
      name: "save",
      listingId: input.listingId,
      sellerId: input.sellerId ?? null,
      userId: input.userId ?? null,
      anonId: input.anonId ?? null,
      props: input.props ?? null,
    },
    opts,
  );
}
