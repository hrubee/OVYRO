/**
 * Read-only presentational table for the admin leads view (spec §4.1.4).
 *
 * A pure server component — no "use client", no actions. Every column is a fact
 * for dispute resolution: which listing, who inquired, the offer, and crucially
 * whether the seller's lead-notification email was delivered and whether the
 * seller has opened the lead yet.
 */
import type { AdminLeadRow } from "@/app/api/admin/leads/_lib/types";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOffer(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function DeliveryBadge({
  delivered,
  at,
}: {
  delivered: boolean;
  at: string | null;
}) {
  return delivered ? (
    <span
      className="text-emerald-600 dark:text-emerald-400"
      title={at ? formatDateTime(at) : undefined}
    >
      Delivered
    </span>
  ) : (
    <span className="text-amber-600 dark:text-amber-400">Pending</span>
  );
}

function ViewedBadge({ viewed, at }: { viewed: boolean; at: string | null }) {
  return viewed ? (
    <span
      className="text-emerald-600 dark:text-emerald-400"
      title={at ? formatDateTime(at) : undefined}
    >
      Viewed
    </span>
  ) : (
    <span className="text-muted-foreground">Not yet</span>
  );
}

export function LeadsTable({ leads }: { leads: AdminLeadRow[] }) {
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        No leads match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[72rem] text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Submitted</th>
            <th className="px-4 py-3 font-medium">Listing</th>
            <th className="px-4 py-3 font-medium">Buyer</th>
            <th className="px-4 py-3 font-medium">Seller</th>
            <th className="px-4 py-3 font-medium">Offer</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Seller viewed</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {leads.map((lead) => (
            <tr key={lead.id} className="align-top">
              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(lead.createdAt)}
              </td>
              <td className="px-4 py-3">
                <div className="max-w-[16rem] truncate font-medium" title={lead.listing.title}>
                  {lead.listing.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  /{lead.listing.slug}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{lead.buyer.name}</div>
                <div className="text-xs text-muted-foreground">
                  {lead.buyer.email}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lead.contactPhone}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{lead.seller.name}</div>
                <div className="text-xs text-muted-foreground">
                  {lead.seller.email}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                {formatOffer(lead.offerAmount, lead.listing.currency)}
              </td>
              <td className="px-4 py-3 capitalize">{lead.status}</td>
              <td className="px-4 py-3 whitespace-nowrap text-xs">
                <DeliveryBadge
                  delivered={lead.emailDelivered}
                  at={lead.emailDeliveredAt}
                />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs">
                <ViewedBadge viewed={lead.sellerViewed} at={lead.sellerViewedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
