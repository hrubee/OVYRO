"use client";

/**
 * Client table for the moderation queue. Each row approves or rejects a listing
 * by POSTing to `/api/admin/listings/[id]/(approve|reject)`, then refreshes the
 * server component so the actioned listing drops out of the pending list.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ModerationListing } from "@/app/api/admin/listings/_lib/types";

export function ModerationTable({ listings }: { listings: ModerationListing[] }) {
  if (listings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        The queue is empty. New submissions will appear here for review.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {listings.map((listing) => (
        <ModerationRow key={listing.id} listing={listing} />
      ))}
    </ul>
  );
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    // Unknown currency code — fall back to a plain number.
    return `${currency} ${price.toLocaleString()}`;
  }
}

function ModerationRow({ listing }: { listing: ModerationListing }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "approved" | "rejected">(null);

  async function act(action: "approve" | "reject", body?: unknown) {
    setError(null);
    setPending(action);
    try {
      const response = await fetch(`/api/admin/listings/${listing.id}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? `Could not ${action} the listing.`);
      }
      setDone(action === "approve" ? "approved" : "rejected");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} the listing.`);
      setPending(null);
    }
  }

  const location = [listing.city, listing.region].filter(Boolean).join(", ");

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate font-medium">{listing.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatPrice(listing.price, listing.currency)}
            {" · "}
            {listing.landType.replace(/_/g, " ")}
            {location ? ` · ${location}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {listing.seller.name} · {listing.seller.email}
          </p>
        </div>

        {done ? (
          <span className="text-sm font-medium text-muted-foreground">
            {done === "approved" ? "Approved ✓" : "Rejected"}
          </span>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              onClick={() => act("approve")}
              disabled={pending !== null}
            >
              {pending === "approve" ? "Approving…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejecting((open) => !open)}
              disabled={pending !== null}
            >
              Reject
            </Button>
          </div>
        )}
      </div>

      {rejecting && !done && (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor={`reason-${listing.id}`} className="text-sm font-medium">
            Reason (emailed to the seller)
          </label>
          <textarea
            id={`reason-${listing.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="Explain what needs to change before this can go live."
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(false)}
              disabled={pending !== null}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => act("reject", { reason })}
              disabled={pending !== null || reason.trim().length === 0}
            >
              {pending === "reject" ? "Rejecting…" : "Confirm rejection"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </li>
  );
}
