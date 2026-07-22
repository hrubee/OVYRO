/**
 * Zod (v4) input schema for the seller marketing settings (spec §5.2).
 *
 * The seller pastes their Meta Pixel setup from Events Manager. That can be the
 * WHOLE base-code snippet (the multi-line `<script>` block Meta hands out) or a
 * bare numeric id. Either way, the server distils it down to the single numeric
 * pixel id via {@link extractPixelId} before anything is persisted.
 *
 * SECURITY (spec R-4): only the extracted numeric id is ever stored or injected.
 * The raw pasted snippet — including any `<script>`/`onerror=`/extra tags an
 * attacker might smuggle in — is discarded here and never reaches
 * `meta_connections.pixel_id` or the trusted pixel-boot script. `.strict()`
 * additionally blocks mass-assignment of the server-owned columns (user_id,
 * status, tokens, timestamps).
 */
import { z } from "zod";
import { PIXEL_ID_PATTERN } from "@/components/meta/pixel-logic";

/** Shown when we can't distil a valid pixel id out of what the seller pasted. */
export const PIXEL_INPUT_ERROR =
  "Enter a valid Meta Pixel ID or paste your full Meta Pixel base code — " +
  "we couldn't find a Pixel ID (the 15–16-digit number from Events Manager) in what you entered.";

/**
 * Match a Meta base-code `fbq('init', '<id>')` call and capture ONLY the id.
 * Tolerates single or double quotes, an unquoted id, an optional
 * advanced-matching options object after it, and arbitrary surrounding
 * whitespace. Because the capture group is strictly `\d{8,20}`, nothing but
 * digits can ever come out — a paste can't smuggle markup through it.
 */
const FBQ_INIT_PATTERN =
  /fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{8,20})['"]?\s*[,)]/i;

/**
 * Distil whatever the seller pasted down to a numeric Meta Pixel id:
 *  - a full Meta base-code snippet → the id inside its `fbq('init', …)` call,
 *  - a bare numeric id → itself (trimmed),
 *  - anything else (a Google tag, prose, malformed init, garbage) → null.
 *
 * The return value is always either pure digits or null; the raw pasted text is
 * never propagated, so only the numeric id can reach the database or the pixel.
 */
export function extractPixelId(raw: string): string | null {
  const text = raw.trim();
  const match = text.match(FBQ_INIT_PATTERN);
  if (match) return match[1];
  return PIXEL_ID_PATTERN.test(text) ? text : null;
}

export const metaPixelUpdateSchema = z
  .object({
    pixelId: z.preprocess(
      // Extract the id up front; on failure hand the trimmed original to the
      // inner check so it produces the helpful error (and never stores garbage).
      (value) =>
        typeof value === "string"
          ? (extractPixelId(value) ?? value.trim())
          : value,
      z.string().trim().regex(PIXEL_ID_PATTERN, PIXEL_INPUT_ERROR),
    ),
  })
  .strict();

export type MetaPixelUpdateInput = z.infer<typeof metaPixelUpdateSchema>;
