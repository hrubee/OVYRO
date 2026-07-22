"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MetaMarketingSettings } from "@/app/api/dashboard/marketing/_lib/repo";
import {
  extractPixelId,
  PIXEL_INPUT_ERROR,
} from "@/app/api/dashboard/marketing/_lib/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SNIPPET_PLACEHOLDER = `Paste your full Meta Pixel base code, e.g.

<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s){…}(…);
  fbq('init', '123456789012345');
  fbq('track', 'PageView');
</script>

…or just the numeric Pixel ID.`;

/**
 * Seller Meta Pixel settings form (spec §5.2). The seller pastes their whole
 * Meta Pixel base code (or a bare id); the id is extracted for both the local
 * validity check and the server (which is authoritative). Saves through
 * `PUT /api/dashboard/marketing` and removes through `DELETE`, refreshing the
 * server tree on success. There are no tokens or OAuth: the pixel simply fires
 * client-side on the seller's public listing pages once a visitor accepts
 * cookie consent.
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
  const extractedId = extractPixelId(pixelId);
  const valid = extractedId !== null;
  const dirty = trimmed !== (initialSettings.pixelId ?? "");
  // Show the parsed id back when they pasted a snippet, so they can confirm it.
  const showDetected = valid && extractedId !== trimmed;

  function clearStatus() {
    setSaved(false);
    setError(null);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    clearStatus();

    if (!valid) {
      setError(PIXEL_INPUT_ERROR);
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/dashboard/marketing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // Send the raw paste; the server extracts and persists only the id.
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
      setPixelId(payload.data?.pixelId ?? extractedId);
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
        <Label htmlFor="pixelId">Meta Pixel base code</Label>
        <textarea
          id="pixelId"
          name="pixelId"
          rows={6}
          autoComplete="off"
          spellCheck={false}
          placeholder={SNIPPET_PLACEHOLDER}
          value={pixelId}
          maxLength={5000}
          aria-invalid={pixelId.length > 0 && !valid}
          onChange={(event) => {
            setPixelId(event.target.value);
            clearStatus();
          }}
          className={cn(
            "w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          )}
        />
        {showDetected ? (
          <p className="text-sm text-muted-foreground">
            Detected Pixel ID:{" "}
            <span className="font-mono font-medium text-foreground">
              {extractedId}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {connected
              ? "Your listing pages fire this pixel after a visitor accepts cookies."
              : "Paste your whole Meta Pixel base code from Events Manager — we'll pull out your Pixel ID automatically. A bare Pixel ID works too."}
          </p>
        )}
      </div>

      <details className="rounded-lg border bg-muted/30 p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Where do I find my Meta Pixel base code?
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
            Open <span className="font-medium text-foreground">Settings</span>,
            then copy the whole{" "}
            <span className="font-medium text-foreground">
              Meta Pixel base code
            </span>{" "}
            and paste it above — or just paste the Pixel ID number itself.
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
