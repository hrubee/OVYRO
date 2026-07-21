import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./columns";
import {
  metaConnectionStatus,
  metaEventChannel,
  metaEventStatus,
} from "./enums";
import { users } from "./auth";
import { listings } from "./listings";
import { leads } from "./buyer";

/** Postgres `bytea` — Drizzle has no first-class column type for it. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * A seller's own Meta ad account + pixel (spec §5). The access token is
 * encrypted at rest with TOKEN_ENCRYPTION_KEY and must never be logged.
 */
export const metaConnections = pgTable(
  "meta_connections",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fbUserId: text("fb_user_id").notNull(),
    businessId: text("business_id"),
    adAccountId: text("ad_account_id"),
    pixelId: text("pixel_id"),
    pixelName: text("pixel_name"),
    accessTokenEncrypted: bytea("access_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: metaConnectionStatus("status").notNull().default("active"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("meta_connections_user_id_key").on(table.userId),
    index("meta_connections_status_idx").on(table.status),
  ],
);

/** Per-dispatch audit trail for Conversions API sends (spec §5.3). */
export const metaEventLog = pgTable(
  "meta_event_log",
  {
    id: idColumn(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => metaConnections.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    listingId: text("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    eventName: text("event_name").notNull(),
    eventId: text("event_id").notNull(),
    channel: metaEventChannel("channel").notNull().default("capi"),
    status: metaEventStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("meta_event_log_connection_id_idx").on(table.connectionId),
    index("meta_event_log_event_id_idx").on(table.eventId),
    index("meta_event_log_status_idx").on(table.status),
    index("meta_event_log_lead_id_idx").on(table.leadId),
  ],
);
