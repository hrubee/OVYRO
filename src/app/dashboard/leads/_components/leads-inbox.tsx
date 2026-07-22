"use client";

/**
 * The seller lead inbox (task OVYRO-9e62, spec §4.3.2): a filter bar over a list
 * of {@link LeadCard}s. The server is the source of truth — changing a filter
 * refetches `GET /api/dashboard/leads` with the new query rather than filtering
 * the initial set client-side, so date/status/listing narrowing always matches
 * what the API (and its ownership scoping) returns.
 */
import { useState, useTransition } from "react";
import { LEAD_STATUSES, type LeadDTO, type LeadStatus } from "@/lib/leads";
import type { SellerListingOption } from "@/app/api/dashboard/leads/_lib/repo";
import { ApiError, leadsApi, type LeadQuery } from "./api-client";
import { LeadCard } from "./lead-card";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

interface FilterState {
  listingId: string;
  status: LeadStatus | "";
  /** Raw `<input type="date">` values (YYYY-MM-DD), anchored to local day. */
  from: string;
  to: string;
}

const EMPTY: FilterState = { listingId: "", status: "", from: "", to: "" };

/** Local day-start → UTC ISO, so the range matches `created_at` (timestamptz). */
function dayStartISO(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function dayEndISO(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export function LeadsInbox({
  initialLeads,
  listingOptions,
}: {
  initialLeads: LeadDTO[];
  listingOptions: SellerListingOption[];
}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY);
  const [leads, setLeads] = useState<LeadDTO[]>(initialLeads);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const titleById = new Map(listingOptions.map((o) => [o.id, o.title]));
  const active =
    filters.listingId !== "" ||
    filters.status !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  function applyFilters(next: FilterState) {
    setFilters(next);
    const query: LeadQuery = {
      listingId: next.listingId || undefined,
      status: next.status || undefined,
      from: dayStartISO(next.from),
      to: dayEndISO(next.to),
    };
    startTransition(async () => {
      setError(null);
      try {
        setLeads(await leadsApi.list(query));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load leads.");
      }
    });
  }

  const patch = (part: Partial<FilterState>) =>
    applyFilters({ ...filters, ...part });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Listing
          <select
            className={selectClass}
            value={filters.listingId}
            onChange={(e) => patch({ listingId: e.target.value })}
          >
            <option value="">All listings</option>
            {listingOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            className={selectClass}
            value={filters.status}
            onChange={(e) => patch({ status: e.target.value as LeadStatus | "" })}
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          From
          <input
            type="date"
            className={selectClass}
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => patch({ from: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          To
          <input
            type="date"
            className={selectClass}
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => patch({ to: e.target.value })}
          />
        </label>

        {active ? (
          <button
            type="button"
            className="h-9 px-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => applyFilters(EMPTY)}
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {leads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          {active
            ? "No leads match these filters."
            : "No leads yet. They'll appear here the moment a buyer inquires on one of your listings."}
        </div>
      ) : (
        <ul
          className="flex flex-col gap-3"
          aria-busy={isPending}
          style={{ opacity: isPending ? 0.6 : 1 }}
        >
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              listingTitle={titleById.get(lead.listingId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
