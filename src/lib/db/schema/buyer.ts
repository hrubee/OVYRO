import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { deletedAt, idColumn, timestamps } from "./columns";
import { leadStatus, preferredContact } from "./enums";
import { users } from "./auth";
import { listings } from "./listings";

/** Saved-listing collections. Every user gets a default list on first save. */
export const lists = pgTable(
  "lists",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lists_user_id_name_key").on(table.userId, table.name),
    index("lists_user_id_idx").on(table.userId),
  ],
);

export const listItems = pgTable(
  "list_items",
  {
    id: idColumn(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** Snapshot so a buyer can see that the asking price moved since saving. */
    priceAtSave: numeric("price_at_save", { precision: 14, scale: 2 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("list_items_list_id_listing_id_key").on(
      table.listId,
      table.listingId,
    ),
    index("list_items_listing_id_idx").on(table.listingId),
  ],
);

/**
 * An inquiry/negotiation submission (spec §4.2.2). v1 "negotiation" is this
 * structured form, not chat. `seller_id` is denormalized on purpose — the
 * seller lead inbox is the hottest seller query (spec §6 notes).
 */
export const leads = pgTable(
  "leads",
  {
    id: idColumn(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerId: text("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offerAmount: numeric("offer_amount", { precision: 14, scale: 2 }),
    message: text("message"),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email"),
    preferredContact: preferredContact("preferred_contact")
      .notNull()
      .default("phone"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    status: leadStatus("status").notNull().default("new"),
    sellerFirstViewedAt: timestamp("seller_first_viewed_at", {
      withTimezone: true,
    }),
    emailDeliveredAt: timestamp("email_delivered_at", { withTimezone: true }),
    /** ULID shared with the Meta pixel + CAPI payloads for dedup (spec §5.3). */
    metaEventId: text("meta_event_id"),
    fbp: text("fbp"),
    fbc: text("fbc"),
    clientIp: text("client_ip"),
    clientUa: text("client_ua"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("leads_meta_event_id_key").on(table.metaEventId),
    index("leads_seller_id_created_at_idx").on(table.sellerId, table.createdAt),
    index("leads_listing_id_idx").on(table.listingId),
    index("leads_buyer_id_idx").on(table.buyerId),
    index("leads_status_idx").on(table.status),
    /**
     * Duplicate suppression is per (listing, buyer, day) and lives in app
     * logic + a Redis rate limit — spec §6 explicitly leaves it out of the
     * schema because the day bucket is not an immutable expression here.
     */
    index("leads_listing_buyer_idx").on(table.listingId, table.buyerId),
  ],
);
