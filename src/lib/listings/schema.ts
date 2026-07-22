/**
 * Zod (v4) input schemas for the listing create/edit wizard (spec §4.3.1).
 *
 * The `land_type` and `area_unit` enums are reused directly from the Drizzle
 * pgEnums so validation can never drift from the columns. Field names are the
 * camelCase Drizzle property names (not the snake_case DB columns), because
 * these objects flow straight into inserts/updates and the serializers.
 *
 * Inputs are expected to be JSON bodies: numeric fields are real numbers, not
 * form strings — the route handler is responsible for coercion if a form ever
 * posts strings.
 */
import { z } from "zod";
import { areaUnit, landType } from "@/lib/db/schema";

/** numeric(14,2): up to 12 integer digits. */
const MAX_PRICE = 999_999_999_999.99;
/** numeric(12,2): up to 10 integer digits. */
const MAX_AREA = 9_999_999_999.99;

// Reusable field validators — shared between create and edit so the two schemas
// can never disagree on how a given field is validated.
const title = z.string().trim().min(3).max(140);
const description = z.string().trim().max(5000);
const landTypeField = z.enum(landType.enumValues);
const price = z.number().positive().max(MAX_PRICE);
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code");
const flag = z.boolean();
const area = z.number().positive().max(MAX_AREA);
const areaUnitField = z.enum(areaUnit.enumValues);
const addressText = z.string().trim().max(500);
const shortText = z.string().trim().min(1).max(120);
const country = z
  .string()
  .trim()
  .toUpperCase()
  .length(2)
  .regex(/^[A-Z]{2}$/, "Country must be a 2-letter ISO 3166-1 code");
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/**
 * Full create input. Required: title, land type, price, area, area unit. The
 * rest carry the same defaults as the columns so a minimal draft is valid.
 * `.strict()` blocks mass-assignment of server-owned fields (status, sellerId,
 * featured, …) that never come from the wizard.
 */
export const listingCreateSchema = z
  .object({
    title,
    description: description.default(""),
    landType: landTypeField,
    price,
    currency: currency.default("INR"),
    negotiable: flag.default(false),
    area,
    areaUnit: areaUnitField,
    addressText: addressText.default(""),
    city: shortText.optional(),
    region: shortText.optional(),
    country: country.optional(),
    lat: lat.optional(),
    lng: lng.optional(),
    surveyNumber: shortText.optional(),
    zoning: shortText.optional(),
    roadAccess: flag.optional(),
    water: flag.optional(),
    electricity: flag.optional(),
    legalDocsAvailable: flag.default(false),
  })
  .strict();

/**
 * Edit input is a PATCH: every field optional, and crucially *no* defaults —
 * an absent `negotiable` must leave the stored value untouched, not reset it to
 * false. Built explicitly (rather than `listingCreateSchema.partial()`) because
 * Zod's `.partial()` keeps `.default()` active for absent keys.
 */
export const listingEditSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    landType: landTypeField.optional(),
    price: price.optional(),
    currency: currency.optional(),
    negotiable: flag.optional(),
    area: area.optional(),
    areaUnit: areaUnitField.optional(),
    addressText: addressText.optional(),
    city: shortText.optional(),
    region: shortText.optional(),
    country: country.optional(),
    lat: lat.optional(),
    lng: lng.optional(),
    surveyNumber: shortText.optional(),
    zoning: shortText.optional(),
    roadAccess: flag.optional(),
    water: flag.optional(),
    electricity: flag.optional(),
    legalDocsAvailable: flag.optional(),
  })
  .strict();

export type ListingCreateInput = z.infer<typeof listingCreateSchema>;
export type ListingEditInput = z.infer<typeof listingEditSchema>;
