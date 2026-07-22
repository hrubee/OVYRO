/**
 * The known feature-flag catalog (spec §4.1.6). Dependency-free so it is
 * unit-testable and safe to import from both server and client.
 *
 * The `flags` table stores only `(key, enabled, payload)`; this catalog is the
 * source of truth for *which* flags exist and what each means. The settings UI
 * renders one toggle per catalog entry, and the toggle route rejects any key not
 * listed here — so an admin can never conjure an arbitrary flag row.
 */
export type FlagGroup = "moderation" | "platform";

export interface FlagDefinition {
  key: string;
  label: string;
  description: string;
  group: FlagGroup;
}

export const FLAG_CATALOG: readonly FlagDefinition[] = [
  {
    key: "listing_auto_approve",
    label: "Auto-approve new listings",
    description:
      "New listings skip the moderation queue and go live immediately. Leave off to review every submission.",
    group: "moderation",
  },
  {
    key: "seller_onboarding_auto_approve",
    label: "Auto-approve seller applications",
    description:
      "Seller onboarding applications are approved without manual review. Leave off to vet each applicant.",
    group: "moderation",
  },
  {
    key: "new_user_signups",
    label: "Allow new sign-ups",
    description:
      "When off, new-account registration is paused platform-wide. Existing users are unaffected.",
    group: "platform",
  },
] as const;

export const FLAG_KEYS: readonly string[] = FLAG_CATALOG.map((flag) => flag.key);

/** True when `key` names a flag in the catalog. */
export function isKnownFlag(key: string): boolean {
  return FLAG_KEYS.includes(key);
}

export function flagDefinition(key: string): FlagDefinition | undefined {
  return FLAG_CATALOG.find((flag) => flag.key === key);
}
