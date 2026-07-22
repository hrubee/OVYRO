"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NotificationPrefs } from "@/app/api/dashboard/profile/_lib/schema";
import type { SellerProfileDTO } from "@/app/api/dashboard/profile/_lib/repo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** The three notification toggles, in display order. */
const PREF_FIELDS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  {
    key: "leadEmail",
    label: "Email me new leads",
    hint: "Get an email the moment a buyer inquires on one of your listings.",
  },
  {
    key: "leadSms",
    label: "Text me new leads",
    hint: "Also send a text message for new leads (standard rates may apply).",
  },
  {
    key: "productUpdates",
    label: "Product updates",
    hint: "Occasional email about new Ovyro features for sellers.",
  },
];

/**
 * Seller profile settings form (spec §4.3). Edits the single `seller_profiles`
 * row through `PUT /api/dashboard/profile` and refreshes the server tree on save
 * so the seeded default is replaced by the persisted row. Save is disabled until
 * something actually changes.
 */
export function SellerProfileForm({
  initialProfile,
}: {
  initialProfile: SellerProfileDTO;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [about, setAbout] = useState(initialProfile.about ?? "");
  const [logoUrl, setLogoUrl] = useState(initialProfile.logoUrl ?? "");
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    initialProfile.notificationPrefs,
  );

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const dirty =
    displayName.trim() !== initialProfile.displayName.trim() ||
    about.trim() !== (initialProfile.about ?? "").trim() ||
    logoUrl.trim() !== (initialProfile.logoUrl ?? "").trim() ||
    prefs.leadEmail !== initialProfile.notificationPrefs.leadEmail ||
    prefs.leadSms !== initialProfile.notificationPrefs.leadSms ||
    prefs.productUpdates !== initialProfile.notificationPrefs.productUpdates;

  function clearStatus() {
    setSaved(false);
    setError(null);
  }

  function togglePref(key: keyof NotificationPrefs) {
    clearStatus();
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (displayName.trim().length === 0) {
      setError("Add a display name buyers will see.");
      return;
    }

    setPending(true);
    let payload: { data?: SellerProfileDTO; error?: { message?: string } };
    try {
      const res = await fetch("/api/dashboard/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          about: about.trim(),
          logoUrl: logoUrl.trim(),
          notificationPrefs: prefs,
        }),
      });
      payload = await res.json();
      if (!res.ok) {
        setError(payload.error?.message ?? "Could not save your profile.");
        return;
      }
    } catch {
      setError("Could not reach the server. Try again.");
      return;
    } finally {
      setPending(false);
    }

    // Re-sync local state from the persisted row so `dirty` resets to false.
    if (payload.data) {
      setDisplayName(payload.data.displayName);
      setAbout(payload.data.about ?? "");
      setLogoUrl(payload.data.logoUrl ?? "");
      setPrefs(payload.data.notificationPrefs);
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          value={displayName}
          maxLength={120}
          onChange={(event) => {
            setDisplayName(event.target.value);
            clearStatus();
          }}
        />
        <p className="text-sm text-muted-foreground">
          Shown as “Listed by …” on your public listings.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="about">About</Label>
        <textarea
          id="about"
          name="about"
          value={about}
          rows={4}
          maxLength={2000}
          onChange={(event) => {
            setAbout(event.target.value);
            clearStatus();
          }}
          className={cn(
            "flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          )}
          placeholder="A short introduction for buyers — who you are and the kind of land you sell."
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="logoUrl">Logo URL</Label>
        <Input
          id="logoUrl"
          name="logoUrl"
          type="url"
          inputMode="url"
          value={logoUrl}
          maxLength={2048}
          onChange={(event) => {
            setLogoUrl(event.target.value);
            clearStatus();
          }}
          placeholder="https://…"
        />
        <p className="text-sm text-muted-foreground">
          Optional. Leave blank to remove your logo.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Notifications</legend>
        {PREF_FIELDS.map((field) => (
          <label key={field.key} className="flex items-start gap-3">
            <input
              type="checkbox"
              name={field.key}
              checked={prefs[field.key]}
              onChange={() => togglePref(field.key)}
              className="mt-1 size-4 rounded border-input accent-primary"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{field.label}</span>
              <span className="text-xs text-muted-foreground">{field.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-primary">Saved.</p>}

      <Button type="submit" disabled={pending || !dirty} className="self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
