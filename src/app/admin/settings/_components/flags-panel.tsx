"use client";

/**
 * Client feature-flag toggles for `/admin/settings` (spec §4.1.6).
 *
 * Each toggle PATCHes `/api/admin/settings/flags/[key]` then refreshes the
 * server component so the rendered state reflects what was persisted (and the
 * audit row that was written). Flags are grouped by their catalog `group`.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminFlag } from "@/app/api/admin/settings/_lib/types";

const GROUP_LABELS: Record<AdminFlag["group"], string> = {
  moderation: "Moderation",
  platform: "Platform",
};

export function FlagsPanel({ flags }: { flags: AdminFlag[] }) {
  const groups = [...new Set(flags.map((flag) => flag.group))];

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {GROUP_LABELS[group]}
          </h2>
          <ul className="divide-y rounded-lg border">
            {flags
              .filter((flag) => flag.group === group)
              .map((flag) => (
                <FlagRow key={flag.key} flag={flag} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FlagRow({ flag }: { flag: AdminFlag }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/settings/flags/${flag.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Could not update the flag.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the flag.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="font-medium">{flag.label}</div>
        <p className="mt-1 text-sm text-muted-foreground">{flag.description}</p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={flag.enabled}
        aria-label={`Toggle ${flag.label}`}
        disabled={pending}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 ${
          flag.enabled ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-background shadow transition-transform ${
            flag.enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </li>
  );
}
