import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { deletedAt, idColumn, timestamps } from "./columns";
import {
  areaUnit,
  landType,
  listingStatus,
  mediaKind,
  mediaProcessingStatus,
} from "./enums";
import { users } from "./auth";

export const listings = pgTable(
  "listings",
  {
    id: idColumn(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    landType: landType("land_type").notNull(),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    negotiable: boolean("negotiable").notNull().default(false),
    area: numeric("area", { precision: 12, scale: 2 }).notNull(),
    areaUnit: areaUnit("area_unit").notNull(),
    addressText: text("address_text").notNull().default(""),
    city: text("city"),
    region: text("region"),
    country: char("country", { length: 2 }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    surveyNumber: text("survey_number"),
    zoning: text("zoning"),
    roadAccess: boolean("road_access"),
    water: boolean("water"),
    electricity: boolean("electricity"),
    legalDocsAvailable: boolean("legal_docs_available").notNull().default(false),
    status: listingStatus("status").notNull().default("draft"),
    rejectedReason: text("rejected_reason"),
    featured: boolean("featured").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt,
    /**
     * Denormalized counters (spec §6 notes) — updated transactionally so
     * browse pages never aggregate over leads/list_items.
     */
    viewCount: integer("view_count").notNull().default(0),
    saveCount: integer("save_count").notNull().default(0),
    leadCount: integer("lead_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("listings_slug_key").on(table.slug),
    index("listings_status_published_at_idx").on(table.status, table.publishedAt),
    index("listings_seller_id_idx").on(table.sellerId),
    index("listings_city_idx").on(table.city),
    index("listings_land_type_idx").on(table.landType),
    index("listings_price_idx").on(table.price),
    index("listings_expires_at_idx").on(table.expiresAt),
    /**
     * Full-text search over title + description + address (spec §6). The
     * expression must match the query side verbatim for the index to be used;
     * `to_tsvector` with a literal regconfig is IMMUTABLE, which is what makes
     * it indexable at all.
     */
    index("listings_fts_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || coalesce(${table.description}, '') || ' ' || coalesce(${table.addressText}, ''))`,
    ),
  ],
);

export const listingMedia = pgTable(
  "listing_media",
  {
    id: idColumn(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url"),
    thumbUrl: text("thumb_url"),
    blurhash: text("blurhash"),
    muxAssetId: text("mux_asset_id"),
    processingStatus: mediaProcessingStatus("processing_status")
      .notNull()
      .default("uploading"),
    sortOrder: integer("sort_order").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    durationS: numeric("duration_s", { precision: 10, scale: 3 }),
    bytes: integer("bytes"),
    ...timestamps,
  },
  (table) => [
    index("listing_media_listing_id_sort_idx").on(table.listingId, table.sortOrder),
    index("listing_media_mux_asset_id_idx").on(table.muxAssetId),
  ],
);
