import { db } from "@/lib/db";
import { analyticsEvents } from "@/lib/db/schema";

/**
 * Funnel event names (spec §10). Kept as a closed union so a typo can't
 * silently create a new event name that never shows up in a chart.
 */
export const ANALYTICS_EVENTS = [
  "signup",
  "listing_view",
  "listing_created",
  "save",
  "inquiry_started",
  "inquiry_submitted",
  "seller_onboarding_started",
  "seller_onboarding_submitted",
  "meta_connected",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

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

/**
 * Record a funnel event.
 *
 * Analytics must never break the request it is measuring, so failures are
 * swallowed after being reported. Writes go straight to Postgres for now;
 * once the worker service lands this becomes a queue push (spec §8).
 */
export async function track(event: AnalyticsEventInput): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
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
