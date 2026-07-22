/**
 * Zod (v4) input schema for the seller marketing settings (spec §5.2).
 *
 * The only writable field in the client-pixel flow is the seller's own Meta
 * Pixel ID — a numeric id they paste from Events Manager. No tokens, no ad
 * account, no OAuth. `.strict()` blocks mass-assignment of the server-owned
 * `meta_connections` columns (user_id, status, tokens, timestamps).
 */
import { z } from "zod";
import { PIXEL_ID_PATTERN } from "@/components/meta/pixel-logic";

export const metaPixelUpdateSchema = z
  .object({
    pixelId: z
      .string()
      .trim()
      .regex(
        PIXEL_ID_PATTERN,
        "Enter a valid Meta Pixel ID — the number (usually 15–16 digits) from Events Manager.",
      ),
  })
  .strict();

export type MetaPixelUpdateInput = z.infer<typeof metaPixelUpdateSchema>;
