/**
 * Zod validation for saved-list mutations (spec §4.2.3). Kept dependency-free —
 * no DB, no session — so it is trivial to unit test and reused by both the API
 * route handlers and the client list manager.
 */
import { z } from "zod";

/** A list name: trimmed, non-empty, capped so it renders in the UI chrome. */
export const listNameSchema = z
  .string()
  .trim()
  .min(1, "Give the list a name.")
  .max(60, "Keep the name under 60 characters.");

export const createListSchema = z.object({ name: listNameSchema });
export const renameListSchema = z.object({ name: listNameSchema });

export type CreateListInput = z.infer<typeof createListSchema>;
export type RenameListInput = z.infer<typeof renameListSchema>;

/** The reserved id the save button uses to target the auto-created wishlist. */
export const DEFAULT_LIST_TOKEN = "default";

/** The name given to every user's auto-created default wishlist. */
export const DEFAULT_LIST_NAME = "Wishlist";
