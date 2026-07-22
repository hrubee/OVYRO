"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MetaMarketingSettings } from "@/app/api/dashboard/marketing/_lib/repo";
import { PIXEL_ID_PATTERN } from "@/components/meta/pixel-logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Seller Meta Pixel settings form (spec §5.2). Saves the seller's own numeric
 * pixel id through `PUT /api/dashboard/marketing` and removes it through
 * `DELETE`, refreshing the server tree on success. There are no tokens or OAuth:
 * the pixel simply fires client-side on the seller's public listing pages once a
 * visitor accepts cookie consent.
 */
export function MetaPixelForm({
  initialSettings,
}: {
  initialSettings: MetaMarketingSettings;
}) {
  const router = useRouter();
  const [pixelId, setPixelId] = useState(initialSettings.pixelId ?? "");
  const [connected, setConnected] = useState(initialSettings.pixelId !== null);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const trimmed = pixelId.trim();
  const valid = PIXEL_ID_PATTERN.test(trimmed);
  const dirty = trimmed !== (initialSettings.pixelId ?? "");

  function clearStatus() {
    setSaved(false);
    setError(null);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    clearStatus();

    if (!valid) {
      setError(
        "Enter a valid Meta Pixel ID — the number (usually 15–16 digits) from Events Manager.",
      );
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/dashboard/marketing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pixelId: trimmed }),
      });
      const payload = (await res.json()) as {
        data?: MetaMarketingSettings;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(payload.error?.message ?? "Could not save your pixel.");
        return;
      }
      setPixelId(payload.data?.pixelId ?? trimmed);
      setConnected(true);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleRemove() {
    clearStatus();
    setPending(true);
    try {
      const res = await fetch("/api/dashboard/marketing", { method: "DELETE" });
      const payload = (await res.json()) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(payload.error?.message ?? "Could not remove your pixel.");
        return;
      }
      setPixelId("");
      setConnected(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="pixelId">Meta Pixel ID</Label>
        <Input
          id="pixelId"
          name="pixelId"
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 123456789012345"
          value={pixelId}
          maxLength={20}
          onChange={(event) => {
            setPixelId(event.target.value);
            clearStatus();
          }}
        />
        <p className="text-sm text-muted-foreground">
          {connected
            ? "Your listing pages fire this pixel after a visitor accepts cookies."
            : "Add your pixel to start tracking views and inquiries from your ads."}
        </p>
      </div>

      <details className="rounded-lg border bg-muted/30 p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Where do I find my Pixel ID?
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Open{" "}
            <span className="font-medium text-foreground">
              Meta Events Manager
            </span>{" "}
            (business.facebook.com/events_manager).
          </li>
          <li>Select your Pixel (data source) in the left sidebar.</li>
          <li>
            Your Pixel ID is the long number shown under its name — copy it here.
          </li>
        </ol>
      </details>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-primary">Saved.</p>}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={pending || !valid || !dirty}
          className="self-start"
        >
          {pending ? "Saving…" : connected ? "Update pixel" : "Save pixel"}
        </Button>
        {connected && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={handleRemove}
          >
            Remove pixel
          </Button>
        )}
      </div>
    </form>
  );
}
