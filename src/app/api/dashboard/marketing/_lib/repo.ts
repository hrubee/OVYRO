/**
 * Data access for a seller's Meta Pixel connection (`meta_connections`, spec
 * §5.2). The rescoped client-pixel flow reuses the existing table but writes
 * only `pixel_id` + `status` — token/ad-account/fb-user columns stay null (there
 * is no OAuth). One row per seller, keyed by `user_id` (the table's unique
 * index), so a save is an idempotent upsert.
 *
 * {@link getOwnerPixelId} is the single read the public landing page uses to
 * decide which pixel fires; it defers to the pure {@link resolveOwnerPixelId}
 * (spec R-4: only an `active` connection's own valid pixel ever fires).
 */
import { eq } from "drizzle-orm";
import { resolveOwnerPixelId } from "@/components/meta/pixel-logic";
import type { Db } from "@/lib/db";
import { metaConnections } from "@/lib/db/schema";

/** Connection status as stored in the `meta_connection_status` enum. */
export type MetaConnectionStatus = "active" | "needs_reauth" | "disconnected";

/** What the marketing settings page + API return (never tokens). */
export interface MetaMarketingSettings {
  /** The saved pixel id when connected, else null. */
  pixelId: string | null;
  status: MetaConnectionStatus | null;
  connectedAt: string | null;
}

/** The raw connection columns this feature reads. */
interface ConnectionRow {
  pixelId: string | null;
  status: MetaConnectionStatus;
  connectedAt: Date | null;
}

const CONNECTION_COLUMNS = {
  pixelId: metaConnections.pixelId,
  status: metaConnections.status,
  connectedAt: metaConnections.connectedAt,
} as const;

/**
 * Serialize a connection row to the settings DTO. A non-`active` connection
 * (e.g. the seller removed their pixel) presents as "not connected" — the pixel
 * id is withheld so the UI shows an empty field.
 */
export function serializeSettings(row: ConnectionRow): MetaMarketingSettings {
  const active = row.status === "active";
  return {
    pixelId: active ? row.pixelId : null,
    status: row.status,
    connectedAt: active ? (row.connectedAt?.toISOString() ?? null) : null,
  };
}

/** The empty state for a seller who has never connected a pixel. */
const EMPTY_SETTINGS: MetaMarketingSettings = {
  pixelId: null,
  status: null,
  connectedAt: null,
};

/** The seller's marketing settings, or the empty state when none exist. */
export async function getMetaMarketingSettings(
  db: Db,
  userId: string,
): Promise<MetaMarketingSettings> {
  const [row] = await db
    .select(CONNECTION_COLUMNS)
    .from(metaConnections)
    .where(eq(metaConnections.userId, userId))
    .limit(1);

  return row ? serializeSettings(row) : EMPTY_SETTINGS;
}

/**
 * The pixel id that may fire on a listing whose owner is `ownerId`, or null.
 * The public landing page's sole entry point for R-4 isolation: it reads only
 * this owner's row and lets {@link resolveOwnerPixelId} gate on status + id.
 */
export async function getOwnerPixelId(
  db: Db,
  ownerId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ pixelId: metaConnections.pixelId, status: metaConnections.status })
    .from(metaConnections)
    .where(eq(metaConnections.userId, ownerId))
    .limit(1);

  return resolveOwnerPixelId(row ?? null);
}

/**
 * Save (create or update) the seller's pixel id and mark the connection active.
 * Idempotent on `user_id`. `fb_user_id` is `NOT NULL` but has no meaning in the
 * client-pixel flow, so it is stored empty.
 */
export async function savePixelId(
  db: Db,
  userId: string,
  pixelId: string,
): Promise<MetaMarketingSettings> {
  const [row] = await db
    .insert(metaConnections)
    .values({
      userId,
      fbUserId: "",
      pixelId,
      status: "active",
      disconnectedAt: null,
    })
    .onConflictDoUpdate({
      target: metaConnections.userId,
      set: {
        pixelId,
        status: "active",
        disconnectedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning(CONNECTION_COLUMNS);

  return serializeSettings(row);
}

/**
 * Remove the seller's pixel: flip the connection to `disconnected` and clear the
 * pixel id so nothing fires. No-op-safe when no row exists.
 */
export async function disablePixel(
  db: Db,
  userId: string,
): Promise<MetaMarketingSettings> {
  const [row] = await db
    .update(metaConnections)
    .set({
      pixelId: null,
      status: "disconnected",
      disconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(metaConnections.userId, userId))
    .returning(CONNECTION_COLUMNS);

  return row ? serializeSettings(row) : EMPTY_SETTINGS;
}
