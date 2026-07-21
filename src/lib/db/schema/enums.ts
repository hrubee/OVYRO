import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Postgres enum types are global, so every name is qualified by its table.
 * Adding a value later is additive (`ALTER TYPE ... ADD VALUE`); removing one
 * is not — prefer widening over reuse.
 */

export const userStatus = pgEnum("user_status", [
  "active",
  "suspended",
  "deleted",
]);

/**
 * Roles are additive and live in the `user_roles` join table — never a column
 * on `users`. `seller` is a strict superset of `buyer` (spec §3.1), which only
 * holds if a user can carry both rows at once.
 */
export const userRole = pgEnum("user_role", ["buyer", "seller", "admin"]);

export const sellerOnboardingState = pgEnum("seller_onboarding_state", [
  "in_progress",
  "submitted",
  "approved",
  "rejected",
]);

export const sellerType = pgEnum("seller_type", [
  "individual",
  "broker",
  "company",
]);

export const landType = pgEnum("land_type", [
  "agricultural",
  "residential_plot",
  "commercial",
  "industrial",
  "recreational",
  "other",
]);

export const areaUnit = pgEnum("area_unit", [
  "sqft",
  "sqm",
  "acre",
  "hectare",
  "guntha",
  "cent",
  "other",
]);

export const listingStatus = pgEnum("listing_status", [
  "draft",
  "pending_review",
  "active",
  "paused",
  "sold",
  "rejected",
  "expired",
]);

export const mediaKind = pgEnum("media_kind", ["photo", "video"]);

export const mediaProcessingStatus = pgEnum("media_processing_status", [
  "uploading",
  "processing",
  "ready",
  "failed",
]);

export const preferredContact = pgEnum("preferred_contact", [
  "phone",
  "whatsapp",
  "email",
]);

export const leadStatus = pgEnum("lead_status", [
  "new",
  "contacted",
  "negotiating",
  "won",
  "lost",
]);

export const metaConnectionStatus = pgEnum("meta_connection_status", [
  "active",
  "needs_reauth",
  "disconnected",
]);

/** v1 dispatches server-side only; `pixel` would be a browser-side mirror. */
export const metaEventChannel = pgEnum("meta_event_channel", ["capi"]);

export const metaEventStatus = pgEnum("meta_event_status", [
  "queued",
  "sent",
  "failed",
]);

export const listingReportStatus = pgEnum("listing_report_status", [
  "open",
  "resolved",
  "dismissed",
]);
