import { ulid } from "ulid";

/**
 * Every primary key in the schema is a ULID stored as `text` (spec §6).
 * ULIDs sort lexicographically by creation time, so `order by id` is a valid
 * chronological ordering and we get index locality that random UUIDs lack.
 */
export function newId(): string {
  return ulid();
}
