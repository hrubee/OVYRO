/**
 * The `meta_event_id` for a lead (spec §5.3).
 *
 * A single ULID is minted at inquiry time and stored on `leads.meta_event_id`.
 * It becomes the deduplication key the Phase-4 Meta CAPI dispatch reuses as the
 * event `event_id`, so a browser pixel event and the server CAPI event for the
 * same lead collapse to one conversion. ULID (not UUID) keeps it consistent with
 * every other id in the schema and sortable by creation time.
 */
import { newId } from "@/lib/db/ids";

export function newMetaEventId(): string {
  return newId();
}
