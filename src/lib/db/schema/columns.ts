import { text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../ids";

/** `created_at`/`updated_at` timestamptz on every table (spec §6 conventions). */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** ULID text primary key, generated application-side. */
export const idColumn = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => newId());

/** Soft delete, only on the tables spec §6 marks with `deleted_at`. */
export const deletedAt = timestamp("deleted_at", { withTimezone: true });
