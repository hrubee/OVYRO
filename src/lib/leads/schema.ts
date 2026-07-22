/**
 * Zod (v4) input schema for the inquiry/negotiation form (spec §4.2.2).
 *
 * v1 "negotiation" is this single structured submission (offer + message),
 * phone-OTP verified upstream — not chat. The `preferred_contact` enum is reused
 * directly from the Drizzle pgEnum so validation can never drift from the column.
 * Keys are the camelCase Drizzle property names (matching `lib/listings/schema`)
 * because the parsed object flows straight into a `leads` insert; the route
 * handler maps `consent: true` onto the `consent_at` timestamp.
 *
 * `.strict()` blocks mass-assignment of server-owned fields (buyerId, sellerId,
 * status, metaEventId, …) that never come from the form.
 */
import { z } from "zod";
import { preferredContact } from "@/lib/db/schema";

/** numeric(14,2): up to 12 integer digits, matching `leads.offer_amount`. */
const MAX_OFFER = 999_999_999_999.99;

const offerAmount = z.number().positive().max(MAX_OFFER);
const message = z.string().trim().min(1).max(2_000);
const contactName = z.string().trim().min(1).max(120);
const contactPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number in international format.");
const contactEmail = z.string().trim().toLowerCase().pipe(z.email());
const preferredContactField = z.enum(preferredContact.enumValues);
/** Consent is mandatory and must be explicitly `true` (spec §4.2.2, §12). */
const consent = z
  .boolean()
  .refine((value) => value === true, "You must consent to be contacted.");

export const inquirySchema = z
  .object({
    offerAmount: offerAmount.optional(),
    message: message.optional(),
    contactName,
    contactPhone,
    contactEmail: contactEmail.optional(),
    preferredContact: preferredContactField.default("phone"),
    consent,
  })
  .strict();

export type InquiryInput = z.infer<typeof inquirySchema>;
