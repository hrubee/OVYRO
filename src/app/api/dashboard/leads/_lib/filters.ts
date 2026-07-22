/**
 * Query-filter parsing for the seller lead inbox (task OVYRO-9e62, spec §4.3.2).
 *
 * The inbox is filterable "by listing, date, status". This module turns the raw
 * `URLSearchParams` of `GET /api/dashboard/leads` into a validated
 * {@link LeadFilters} object, and is kept pure (no DB, no request) so the
 * parsing rules are exhaustively unit-testable. The repo layer owns turning the
 * filters into a `where` clause; this owns only validation.
 *
 * Keys accepted: `listingId`, `status`, `from`, `to`. Blank values are dropped
 * (an empty `<select>`/`<input>` serializes to `?status=`), and unknown params
 * are ignored rather than rejected — a filter URL often carries unrelated query
 * string. `from`/`to` are coerced to `Date` (start/end of a range on
 * `created_at`); the seller may pass either bound alone.
 */
import { z } from "zod";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads";

export const leadFiltersSchema = z
  .object({
    listingId: z.string().trim().min(1).optional(),
    status: z.enum(LEAD_STATUSES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .refine(
    (f) => f.from === undefined || f.to === undefined || f.from <= f.to,
    { message: "The 'from' date must be on or before the 'to' date.", path: ["from"] },
  );

export interface LeadFilters {
  listingId?: string;
  status?: LeadStatus;
  from?: Date;
  to?: Date;
}

/** The filter keys we read off the query string — everything else is ignored. */
const FILTER_KEYS = ["listingId", "status", "from", "to"] as const;

/**
 * Validate the inbox filters from a request's search params. Only the known
 * keys are read, and blank values are treated as absent so an unset control
 * never narrows the query. Throws `ZodError` (→ 400) on a malformed value.
 */
export function parseLeadFilters(params: URLSearchParams): LeadFilters {
  const raw: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value !== null && value.trim() !== "") {
      raw[key] = value;
    }
  }
  return leadFiltersSchema.parse(raw);
}
