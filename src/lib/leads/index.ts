/**
 * Leads core — the shared foundation the wave-2 lead builders (OTP, inquiry
 * submission, seller inbox, buyer account) all depend on (spec §4.2.2). Import
 * from `@/lib/leads`, not the individual modules.
 */
export * from "./status";
export * from "./schema";
export * from "./types";
export * from "./meta-event";
