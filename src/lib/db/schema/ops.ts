import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./columns";
import { listingReportStatus } from "./enums";
import { users } from "./auth";
import { listings } from "./listings";

/**
 * Append-only event stream (spec §10). Deliberately NOT ULID-keyed: this is
 * the one high-volume table, a bigserial keeps inserts cheap, and spec §6
 * flags it for monthly partitioning if volume grows.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    eventName: text("event_name").notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Cookie-scoped id so pre-signup funnel steps still join up. */
    anonId: text("anon_id"),
    listingId: text("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    sellerId: text("seller_id").references(() => users.id, {
      onDelete: "set null",
    }),
    propsJsonb: jsonb("props_jsonb"),
    ...timestamps,
  },
  (table) => [
    index("analytics_events_name_occurred_at_idx").on(
      table.eventName,
      table.occurredAt,
    ),
    index("analytics_events_listing_id_idx").on(table.listingId),
    index("analytics_events_user_id_idx").on(table.userId),
    index("analytics_events_seller_id_idx").on(table.sellerId),
  ],
);

/** Every admin mutation is logged with a before/after snapshot (spec §3.2). */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: idColumn(),
    adminId: text("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJsonb: jsonb("before_jsonb"),
    afterJsonb: jsonb("after_jsonb"),
    ...timestamps,
  },
  (table) => [
    index("admin_audit_log_admin_id_idx").on(table.adminId),
    index("admin_audit_log_entity_idx").on(table.entityType, table.entityId),
    index("admin_audit_log_created_at_idx").on(table.createdAt),
  ],
);

export const flags = pgTable(
  "flags",
  {
    id: idColumn(),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    payloadJsonb: jsonb("payload_jsonb"),
    ...timestamps,
  },
  (table) => [uniqueIndex("flags_key_key").on(table.key)],
);

export const listingReports = pgTable(
  "listing_reports",
  {
    id: idColumn(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    detail: text("detail"),
    status: listingReportStatus("status").notNull().default("open"),
    ...timestamps,
  },
  (table) => [
    index("listing_reports_listing_id_idx").on(table.listingId),
    index("listing_reports_status_idx").on(table.status),
  ],
);
