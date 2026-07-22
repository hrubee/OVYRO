"use client";

/**
 * A single lead in the seller inbox — a lightweight CRM card (task OVYRO-9e62,
 * spec §4.3.2).
 *
 * Summary (always visible): buyer name, verified-phone badge, offer amount,
 * message, status, and timestamps. Opening the card reveals the buyer's contact
 * details and, on that *first* open, calls `GET /api/dashboard/leads/[id]` — the
 * server stamps `sellerFirstViewedAt`, so an unopened lead keeps its "new"
 * (unread) dot for the admin funnel until the seller actually reads it.
 *
 * The status pipeline offers only the moves leads-core allows from the current
 * status; the server re-validates every transition, so an illegal move surfaces
 * the server's `INVALID_TRANSITION` message inline rather than being trusted here.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeadDTO, LeadStatus, PreferredContact } from "@/lib/leads";
import { ApiError, leadsApi } from "./api-client";
import { leadActionsFor } from "./lead-actions";
import { LeadStatusBadge } from "./lead-status-badge";

const CONTACT_LABELS: Record<PreferredContact, string> = {
  phone: "Phone call",
  whatsapp: "WhatsApp",
  email: "Email",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Leads carry no currency of their own (spec §6) — group digits, no symbol. */
function formatOffer(amount: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    amount,
  );
}

export function LeadCard({
  lead: initialLead,
  listingTitle,
}: {
  lead: LeadDTO;
  listingTitle?: string;
}) {
  const [lead, setLead] = useState(initialLead);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unread = lead.sellerFirstViewedAt === null;
  const actions = leadActionsFor(lead.status);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    // First open of an unread lead: stamp the first-view server-side.
    if (next && unread) {
      try {
        const viewed = await leadsApi.get(lead.id);
        setLead(viewed);
      } catch {
        // A failed read stamp is non-fatal — the details are already local.
      }
    }
  }

  async function runStatus(to: LeadStatus) {
    setPending(true);
    setError(null);
    try {
      const updated = await leadsApi.setStatus(lead.id, to);
      setLead(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {unread ? (
              <span
                aria-label="Unread lead"
                title="Unread"
                className="size-2 shrink-0 rounded-full bg-emerald-500"
              />
            ) : null}
            <span className="truncate font-medium">{lead.contactName}</span>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              title="Phone verified by OTP at submission"
            >
              <span aria-hidden>✓</span> Phone verified
            </span>
            <LeadStatusBadge status={lead.status} />
          </div>
          {listingTitle ? (
            <p className="truncate text-sm text-muted-foreground">
              On “{listingTitle}”
            </p>
          ) : null}
        </div>
        {lead.offerAmount !== null ? (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Offer</p>
            <p className="font-semibold tabular-nums">
              {formatOffer(lead.offerAmount)}
            </p>
          </div>
        ) : null}
      </div>

      {lead.message ? (
        <p className="whitespace-pre-wrap text-sm text-foreground/90">
          {lead.message}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No message provided.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Received {formatDateTime(lead.createdAt)}</span>
        <span>
          Prefers {CONTACT_LABELS[lead.preferredContact]}
        </span>
        {lead.sellerFirstViewedAt ? (
          <span>Viewed {formatDateTime(lead.sellerFirstViewedAt)}</span>
        ) : null}
      </div>

      {open ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium text-muted-foreground">Phone</dt>
          <dd>
            <a className="underline underline-offset-2" href={`tel:${lead.contactPhone}`}>
              {lead.contactPhone}
            </a>
          </dd>
          {lead.contactEmail ? (
            <>
              <dt className="font-medium text-muted-foreground">Email</dt>
              <dd>
                <a
                  className="underline underline-offset-2"
                  href={`mailto:${lead.contactEmail}`}
                >
                  {lead.contactEmail}
                </a>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={toggleOpen}>
          {open ? "Hide contact" : "View contact"}
        </Button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {actions.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {lead.status === "won" ? "Deal won 🎉" : "Lead closed"}
          </span>
        ) : (
          actions.map((action) => (
            <Button
              key={action.action}
              size="sm"
              variant={action.action === "lose" ? "ghost" : "default"}
              disabled={pending}
              onClick={() => runStatus(action.to)}
            >
              {action.label}
            </Button>
          ))
        )}
      </div>
    </li>
  );
}
