/**
 * Barrel for transactional email templates. Import from `@/lib/email/templates`.
 *
 * Kept separate from `@/lib/email` (which owns the Resend client + `sendEmail`)
 * so producers can render a template without pulling the delivery client, and so
 * the worker can import templates without importing anything web-specific.
 */
export * from "./listing-moderation";
