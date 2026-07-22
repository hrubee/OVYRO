"use client";

/**
 * The seller's listing index. Renders each listing with its status, the
 * seller-available status actions (derived from the shared state machine), and
 * a soft-delete. All mutations go through the listings API; the server is the
 * source of truth, so e.g. a "Submit for review" with no photos surfaces the
 * server's `PHOTOS_REQUIRED` message inline rather than being pre-guessed here.
 */
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ListingDTO, ListingStatus, ListingSummary } from "@/lib/listings";
import { ApiError, listingsApi } from "./api-client";
import { sellerActionsFor } from "./actions";
import { StatusBadge } from "./status-badge";

interface RowState {
  status: ListingStatus;
  pending: boolean;
  error: string | null;
  deleted: boolean;
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

export function ListingsTable({
  initialListings,
}: {
  initialListings: ListingSummary[];
}) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      initialListings.map((listing) => [
        listing.id,
        { status: listing.status, pending: false, error: null, deleted: false },
      ]),
    ),
  );

  function patchRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function runStatus(id: string, to: ListingStatus) {
    patchRow(id, { pending: true, error: null });
    try {
      const updated = await listingsApi.setStatus<ListingDTO>(id, to);
      patchRow(id, { status: updated.status, pending: false });
    } catch (err) {
      patchRow(id, {
        pending: false,
        error: err instanceof ApiError ? err.message : "Something went wrong.",
      });
    }
  }

  async function runDelete(id: string) {
    if (!window.confirm("Delete this listing? It will be hidden from buyers.")) {
      return;
    }
    patchRow(id, { pending: true, error: null });
    try {
      await listingsApi.remove(id);
      patchRow(id, { pending: false, deleted: true });
    } catch (err) {
      patchRow(id, {
        pending: false,
        error: err instanceof ApiError ? err.message : "Something went wrong.",
      });
    }
  }

  const visible = initialListings.filter((listing) => !rows[listing.id]?.deleted);

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No listings yet. Create your first one to start collecting leads.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visible.map((listing) => {
        const row = rows[listing.id];
        const actions = sellerActionsFor(row.status);
        return (
          <li
            key={listing.id}
            className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{listing.title}</span>
                <StatusBadge status={row.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {formatPrice(listing.price, listing.currency)}
                {listing.city ? ` · ${listing.city}` : ""}
              </p>
              {row.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {row.error}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions.map((action) => (
                <Button
                  key={action.action}
                  size="sm"
                  variant={action.action === "submit" ? "default" : "outline"}
                  disabled={row.pending}
                  onClick={() => runStatus(listing.id, action.to)}
                >
                  {action.label}
                </Button>
              ))}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/dashboard/listings/${listing.id}/edit`}>Edit</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={row.pending}
                onClick={() => runDelete(listing.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
