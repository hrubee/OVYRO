/**
 * Wire shapes for the admin settings surface (spec §4.1.6). No DB / server-only
 * imports so the client `flags-panel` can `import type` these freely.
 */
import type { FlagGroup } from "./catalog";

/** A catalog flag merged with its current stored state. */
export interface AdminFlag {
  key: string;
  label: string;
  description: string;
  group: FlagGroup;
  enabled: boolean;
  /** When the stored value last changed; null if never persisted (catalog default). */
  updatedAt: string | null;
}

/** An admin, for the read-only admin-management stub. */
export interface AdminSummary {
  id: string;
  name: string;
  email: string;
}
