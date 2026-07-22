import { cn } from "@/lib/utils";
import type { ListingStatus } from "@/lib/listings";

const STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Draft",
  pending_review: "In review",
  active: "Active",
  paused: "Paused",
  sold: "Sold",
  rejected: "Rejected",
  expired: "Expired",
};

/** Muted → prominent, matching how "live" each status is. */
const STATUS_STYLES: Record<ListingStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  paused: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  sold: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ListingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
