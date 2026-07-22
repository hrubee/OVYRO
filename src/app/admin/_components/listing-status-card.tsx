/**
 * Listing counts by status on the `/admin` overview (spec §4.1.1). The four the
 * spec calls out — active, paused, pending review, rejected — lead; the rest
 * (draft, sold, expired) follow in a muted row so the totals still reconcile
 * with the raw table (spec §14). Pure server component.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtCount } from "@/app/admin/_lib/format";
import type { ListingStatus } from "@/lib/analytics";

const PRIMARY: { status: ListingStatus; label: string }[] = [
  { status: "active", label: "Active" },
  { status: "pending_review", label: "Pending review" },
  { status: "paused", label: "Paused" },
  { status: "rejected", label: "Rejected" },
];

const SECONDARY: { status: ListingStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "sold", label: "Sold" },
  { status: "expired", label: "Expired" },
];

export function ListingStatusCard({
  counts,
}: {
  counts: Record<ListingStatus, number>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="gap-1">
        <CardDescription>Listings by status</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{fmtCount(total)}</CardTitle>
        <p className="text-xs text-muted-foreground">total (excludes deleted)</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3">
          {PRIMARY.map(({ status, label }) => (
            <div key={status} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {fmtCount(counts[status])}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          {SECONDARY.map(({ status, label }) => (
            <span key={status}>
              {label}{" "}
              <span className="tabular-nums font-medium text-foreground">
                {fmtCount(counts[status])}
              </span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
