/**
 * Shared listing DTOs + serializers (spec §4.3.1, §6).
 *
 * `serialize` / `serializeSummary` turn a Drizzle row into a JSON-safe shape
 * that both public browse pages and the seller dashboard render from, so the
 * two surfaces can never disagree on the wire format. Conversions handled here:
 *   - numeric columns (`price`, `area`, `duration_s`) arrive from pg as strings
 *     → coerced to `number`
 *   - timestamptz columns arrive as `Date` → emitted as ISO-8601 strings
 *
 * Note: `rejectedReason` is owner/admin-only moderation feedback. Public
 * serialization must drop it — prefer `serializeSummary` for browse surfaces.
 */
import type { InferSelectModel } from "drizzle-orm";
import {
  areaUnit,
  landType,
  listingMedia,
  listings,
  mediaKind,
  mediaProcessingStatus,
} from "@/lib/db/schema";
import type { ListingStatus } from "./status";

export type ListingRow = InferSelectModel<typeof listings>;
export type ListingMediaRow = InferSelectModel<typeof listingMedia>;

export type LandType = (typeof landType.enumValues)[number];
export type AreaUnit = (typeof areaUnit.enumValues)[number];
export type MediaKind = (typeof mediaKind.enumValues)[number];
export type MediaProcessingStatus = (typeof mediaProcessingStatus.enumValues)[number];

export interface ListingMediaDTO {
  id: string;
  kind: MediaKind;
  url: string | null;
  thumbUrl: string | null;
  blurhash: string | null;
  sortOrder: number;
  width: number | null;
  height: number | null;
  durationS: number | null;
  processingStatus: MediaProcessingStatus;
}

/** Full listing detail — landing page and dashboard detail view. */
export interface ListingDTO {
  id: string;
  slug: string;
  sellerId: string;
  title: string;
  description: string;
  landType: LandType;
  price: number;
  currency: string;
  negotiable: boolean;
  area: number;
  areaUnit: AreaUnit;
  addressText: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  surveyNumber: string | null;
  zoning: string | null;
  roadAccess: boolean | null;
  water: boolean | null;
  electricity: boolean | null;
  legalDocsAvailable: boolean;
  status: ListingStatus;
  /** Owner/admin only — never send to public surfaces. */
  rejectedReason: string | null;
  featured: boolean;
  coverImageUrl: string | null;
  media: ListingMediaDTO[];
  viewCount: number;
  saveCount: number;
  leadCount: number;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Condensed, public-safe shape for browse cards and list rows. */
export interface ListingSummary {
  id: string;
  slug: string;
  title: string;
  landType: LandType;
  price: number;
  currency: string;
  negotiable: boolean;
  area: number;
  areaUnit: AreaUnit;
  city: string | null;
  region: string | null;
  country: string | null;
  status: ListingStatus;
  featured: boolean;
  coverImageUrl: string | null;
  viewCount: number;
  saveCount: number;
  publishedAt: string | null;
  createdAt: string;
}

const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const numOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

export function serializeMedia(row: ListingMediaRow): ListingMediaDTO {
  return {
    id: row.id,
    kind: row.kind,
    url: row.url,
    thumbUrl: row.thumbUrl,
    blurhash: row.blurhash,
    sortOrder: row.sortOrder,
    width: row.width,
    height: row.height,
    durationS: numOrNull(row.durationS),
    processingStatus: row.processingStatus,
  };
}

/** The cover is the first photo by sort order that has a resolved URL. */
function coverUrl(media: readonly ListingMediaDTO[]): string | null {
  const cover = media.find((m) => m.kind === "photo" && m.url !== null);
  return cover?.url ?? null;
}

/**
 * Serialize a full listing. Pass its media rows (any order) to populate
 * `media` and derive `coverImageUrl`; omit them for a metadata-only DTO.
 */
export function serialize(row: ListingRow, media: ListingMediaRow[] = []): ListingDTO {
  const mediaDtos = [...media]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(serializeMedia);

  return {
    id: row.id,
    slug: row.slug,
    sellerId: row.sellerId,
    title: row.title,
    description: row.description,
    landType: row.landType,
    price: Number(row.price),
    currency: row.currency,
    negotiable: row.negotiable,
    area: Number(row.area),
    areaUnit: row.areaUnit,
    addressText: row.addressText,
    city: row.city,
    region: row.region,
    country: row.country,
    lat: row.lat,
    lng: row.lng,
    surveyNumber: row.surveyNumber,
    zoning: row.zoning,
    roadAccess: row.roadAccess,
    water: row.water,
    electricity: row.electricity,
    legalDocsAvailable: row.legalDocsAvailable,
    status: row.status,
    rejectedReason: row.rejectedReason,
    featured: row.featured,
    coverImageUrl: coverUrl(mediaDtos),
    media: mediaDtos,
    viewCount: row.viewCount,
    saveCount: row.saveCount,
    leadCount: row.leadCount,
    publishedAt: isoOrNull(row.publishedAt),
    expiresAt: isoOrNull(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Serialize a condensed, public-safe summary. Pass the cover media row (if
 * known) to populate `coverImageUrl` without loading the full media set.
 */
export function serializeSummary(
  row: ListingRow,
  cover?: ListingMediaRow | null,
): ListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    landType: row.landType,
    price: Number(row.price),
    currency: row.currency,
    negotiable: row.negotiable,
    area: Number(row.area),
    areaUnit: row.areaUnit,
    city: row.city,
    region: row.region,
    country: row.country,
    status: row.status,
    featured: row.featured,
    coverImageUrl: cover?.url ?? null,
    viewCount: row.viewCount,
    saveCount: row.saveCount,
    publishedAt: isoOrNull(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
  };
}
