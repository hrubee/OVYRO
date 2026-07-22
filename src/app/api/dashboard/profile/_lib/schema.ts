/**
 * Zod (v4) input schema for the seller profile settings form (spec §4.3).
 *
 * `seller_profiles` is a single row per seller. This is a full-replace `PUT`:
 * the form always submits every field, so an omitted optional field means
 * "cleared", not "left untouched" (unlike the resumable onboarding wizard).
 *
 * `display_name` is the one required field — it feeds the public listing seller
 * name (spec §4.2.1, the "Listed by …" line), so it can never be blank.
 * `.strict()` blocks mass-assignment of the server-owned columns (id, user_id,
 * timestamps) that never come from the form.
 */
import { z } from "zod";

/**
 * Seller notification preferences, persisted to `notification_prefs_json`.
 * Booleans only: whether to notify on new leads (email / SMS) and whether to
 * receive product-update mail. Kept as a closed `.strict()` object so an unknown
 * key can't smuggle arbitrary JSON into the column.
 */
export const notificationPrefsSchema = z
  .object({
    leadEmail: z.boolean(),
    leadSms: z.boolean(),
    productUpdates: z.boolean(),
  })
  .strict();

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/** Sensible defaults for a seller who has never touched their preferences. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  leadEmail: true,
  leadSms: false,
  productUpdates: true,
};

/**
 * Optional free-text URL (the logo). An empty string is the explicit "clear it"
 * signal; anything else must be a valid URL. The repo normalises `""` → `null`.
 */
const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || z.url().safeParse(value).success, {
    message: "Enter a valid URL, or leave it blank.",
  });

export const sellerProfileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Add a display name buyers will see.")
      .max(120),
    about: z.string().trim().max(2000).optional().default(""),
    logoUrl: optionalUrl.optional().default(""),
    notificationPrefs: notificationPrefsSchema
      .optional()
      .default(DEFAULT_NOTIFICATION_PREFS),
  })
  .strict();

export type SellerProfileUpdateInput = z.infer<typeof sellerProfileUpdateSchema>;
