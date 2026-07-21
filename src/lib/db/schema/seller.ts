import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./columns";
import { sellerOnboardingState, sellerType } from "./enums";
import { users } from "./auth";

/**
 * Buyer → seller upgrade (spec §4.2.4). Approval is what grants the additive
 * `seller` role; this table is the application record, not the permission.
 */
export const sellerOnboarding = pgTable(
  "seller_onboarding",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    step: integer("step").notNull().default(0),
    state: sellerOnboardingState("state").notNull().default("in_progress"),
    sellerType: sellerType("seller_type"),
    legalName: text("legal_name"),
    addressJson: jsonb("address_json"),
    idDocumentUrl: text("id_document_url"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("seller_onboarding_user_id_key").on(table.userId)],
);

export const sellerProfiles = pgTable(
  "seller_profiles",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    about: text("about"),
    logoUrl: text("logo_url"),
    notificationPrefsJson: jsonb("notification_prefs_json"),
    ...timestamps,
  },
  (table) => [uniqueIndex("seller_profiles_user_id_key").on(table.userId)],
);
