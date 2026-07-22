import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/leads";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

/** Muted → prominent, tracking how far a lead has moved down the pipeline. */
const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  contacted: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  negotiating:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  won: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  lost: "bg-muted text-muted-foreground",
};

export function LeadStatusBadge({
  status,
  className,
}: {
  status: LeadStatus;
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
