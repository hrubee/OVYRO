/**
 * Data access for a seller's own profile row (`seller_profiles`, spec §4.3).
 *
 * One row per seller, keyed by `user_id` (the table's unique index). A seller
 * may not have a row yet — the row is not created at role-grant time — so the
 * settings page reads through {@link getSellerProfileOrDefault}, which seeds a
 * sensible default (their account name) instead of 404-ing, and the save path
 * is an idempotent upsert.
 *
 * The pure helpers ({@link parseNotificationPrefs}, {@link serializeRow},
 * {@link normalizeInput}) carry the logic that is worth unit-testing without a
 * database; the exported async functions are thin Drizzle wrappers around them.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sellerProfiles } from "@/lib/db/schema";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
  notificationPrefsSchema,
  type SellerProfileUpdateInput,
} from "./schema";

/** The profile shape the settings page and API return (jsonb already parsed). */
export interface SellerProfileDTO {
  displayName: string;
  about: string | null;
  logoUrl: string | null;
  notificationPrefs: NotificationPrefs;
}

/** The `seller_profiles` columns this feature reads. */
interface SellerProfileRow {
  displayName: string;
  about: string | null;
  logoUrl: string | null;
  notificationPrefsJson: unknown;
}

/**
 * Coerce the untyped `notification_prefs_json` blob into a known shape. Legacy
 * or partial JSON (including `null`, from a row created before prefs existed)
 * falls back to {@link DEFAULT_NOTIFICATION_PREFS} rather than throwing.
 */
export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const parsed = notificationPrefsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_PREFS;
}

/** Map a raw DB row to the serialized DTO (parsing the jsonb prefs column). */
export function serializeRow(row: SellerProfileRow): SellerProfileDTO {
  return {
    displayName: row.displayName,
    about: row.about,
    logoUrl: row.logoUrl,
    notificationPrefs: parseNotificationPrefs(row.notificationPrefsJson),
  };
}

/**
 * The default profile shown to a seller who has never saved one. `displayName`
 * seeds from their account name so the public "Listed by …" line is never blank.
 */
export function defaultProfile(fallbackName: string): SellerProfileDTO {
  return {
    displayName: fallbackName.trim(),
    about: null,
    logoUrl: null,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  };
}

/** Turn validated form input into the column values to persist (`""` → `null`). */
export function normalizeInput(input: SellerProfileUpdateInput): {
  displayName: string;
  about: string | null;
  logoUrl: string | null;
  notificationPrefsJson: NotificationPrefs;
} {
  return {
    displayName: input.displayName,
    about: input.about === "" ? null : input.about,
    logoUrl: input.logoUrl === "" ? null : input.logoUrl,
    notificationPrefsJson: input.notificationPrefs,
  };
}

const PROFILE_COLUMNS = {
  displayName: sellerProfiles.displayName,
  about: sellerProfiles.about,
  logoUrl: sellerProfiles.logoUrl,
  notificationPrefsJson: sellerProfiles.notificationPrefsJson,
} as const;

/** The seller's profile, or `null` when they have not saved one yet. */
export async function getSellerProfile(
  db: Db,
  userId: string,
): Promise<SellerProfileDTO | null> {
  const [row] = await db
    .select(PROFILE_COLUMNS)
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId))
    .limit(1);

  return row ? serializeRow(row) : null;
}

/** The seller's profile, or a name-seeded default when none exists yet. */
export async function getSellerProfileOrDefault(
  db: Db,
  userId: string,
  fallbackName: string,
): Promise<SellerProfileDTO> {
  return (await getSellerProfile(db, userId)) ?? defaultProfile(fallbackName);
}

/**
 * Create or update the seller's profile. Idempotent on `user_id` via the
 * table's unique index, so a repeat save is an update, never a duplicate row.
 */
export async function upsertSellerProfile(
  db: Db,
  userId: string,
  input: SellerProfileUpdateInput,
): Promise<SellerProfileDTO> {
  const values = normalizeInput(input);

  const [row] = await db
    .insert(sellerProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: sellerProfiles.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning(PROFILE_COLUMNS);

  return serializeRow(row);
}
