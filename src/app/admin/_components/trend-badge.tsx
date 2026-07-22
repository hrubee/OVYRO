/**
 * The "trend vs previous period" chip on an overview KPI card (spec §4.1.1).
 * Green when the metric moved the way you want, red the other way, muted when
 * flat. `invert` flips the good/bad colouring for metrics where down is good.
 * Growth from a zero baseline shows "New" rather than a bogus percentage.
 */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTrendPct } from "@/app/admin/_lib/format";
import type { Trend } from "@/lib/analytics";

export interface TrendBadgeProps {
  trend: Trend;
  /** For metrics where a decrease is the good outcome. */
  invert?: boolean;
  className?: string;
}

export function TrendBadge({ trend, invert = false, className }: TrendBadgeProps) {
  const { direction, pct } = trend;
  const Icon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  const tone =
    direction === "flat"
      ? "muted"
      : (direction === "up") !== invert
        ? "good"
        : "bad";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        tone === "good" &&
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        tone === "bad" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
      aria-label={`${fmtTrendPct(pct)} versus the previous period`}
    >
      <Icon className="size-3" aria-hidden />
      {fmtTrendPct(pct)}
    </span>
  );
}
