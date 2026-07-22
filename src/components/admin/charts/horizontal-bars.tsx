/**
 * A categorical horizontal-bar list for the admin analytics page (spec §4.1.5)
 * — e.g. "top listings by leads". CSS-only (bar widths as percentages of the
 * max), so it reads cleanly with long text labels and needs no SVG. Pure server
 * component.
 */
import Link from "next/link";
import { cn } from "@/lib/utils";
import { fmtCount } from "@/app/admin/_lib/format";

export interface HorizontalBarItem {
  label: string;
  value: number;
  /** Optional link (e.g. to the listing). */
  href?: string;
}

export interface HorizontalBarsProps {
  items: HorizontalBarItem[];
  /** Rendered when there is nothing to show. */
  emptyLabel?: string;
  colorClass?: string;
}

export function HorizontalBars({
  items,
  emptyLabel = "No data for this period yet.",
  colorClass = "bg-primary/80",
}: HorizontalBarsProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = items.reduce((m, it) => Math.max(m, it.value), 0);

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => {
        const pct = max === 0 ? 0 : Math.max(2, (item.value / max) * 100);
        const label = (
          <span className="truncate font-medium text-foreground">
            {item.label}
          </span>
        );
        return (
          <li key={`${item.label}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {item.href ? (
                <Link href={item.href} className="truncate hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="tabular-nums text-muted-foreground">
                {fmtCount(item.value)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              aria-hidden
            >
              <div
                className={cn("h-full rounded-full", colorClass)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
