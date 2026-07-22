/**
 * Parse + split an inquiry request body (spec §4.2.2, §12).
 *
 * The wire payload carries the inquiry fields plus two anti-abuse envelope
 * fields — a CAPTCHA token and a honeypot — that must never reach the leads
 * insert. This peels those off, rejects a filled honeypot as spam, then hands
 * the remaining fields to the leads-core `.strict()` schema (which blocks
 * mass-assignment of any server-owned column). Pure and DB-free, so it
 * unit-tests without a request.
 */
import { inquirySchema, type InquiryInput } from "@/lib/leads";
import { SpamRejectedError } from "./http";

/** Hidden field real users never see; bots auto-fill it (spec §4.2.2). */
export const HONEYPOT_FIELD = "website";
/** Cloudflare Turnstile token field. */
export const CAPTCHA_FIELD = "captchaToken";

export interface ParsedSubmission {
  inquiry: InquiryInput;
  captchaToken: string;
}

/**
 * Validate a raw JSON body. Throws `SpamRejectedError` when the honeypot is
 * filled, or a `ZodError` when the inquiry fields are invalid.
 */
export function parseSubmission(raw: unknown): ParsedSubmission {
  const record =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const honeypot = record[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    throw new SpamRejectedError();
  }

  const captchaRaw = record[CAPTCHA_FIELD];
  const captchaToken = typeof captchaRaw === "string" ? captchaRaw : "";

  const rest: Record<string, unknown> = { ...record };
  delete rest[HONEYPOT_FIELD];
  delete rest[CAPTCHA_FIELD];

  const inquiry = inquirySchema.parse(rest);
  return { inquiry, captchaToken };
}
