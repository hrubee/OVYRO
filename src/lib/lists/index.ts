/**
 * Saved-lists core — the buyer-account "save to list" foundation (spec §4.2.3).
 * Import from `@/lib/lists`, not the individual modules.
 *
 * - `schema` — Zod validation + the `default` token / default list name
 * - `types`  — DTOs + serializers shared by the account page and `/api/me/lists`
 * - `errors` — typed 409s the route mapper understands
 * - `repo`   — the user-scoped data access the routes and pages call
 */
export * from "./schema";
export * from "./types";
export * from "./errors";
export * from "./repo";
