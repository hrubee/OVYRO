/**
 * Panel chrome for the `/admin/analytics` charts (spec §4.1.5): a titled card
 * with an optional period-total headline and a top-right slot for a legend or
 * note, wrapping any of the SVG/CSS chart components. Pure server component —
 * keeps every panel visually consistent without repeating the card markup.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  title: string;
  /** Big headline figure for the period (e.g. the series total). */
  total?: string;
  /** One-line caption under the title. */
  caption?: string;
  /** Top-right slot — typically a {@link SeriesLegend} or short note. */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  total,
  caption,
  aside,
  className,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn("gap-4 py-5", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardDescription>{title}</CardDescription>
            {total ? (
              <CardTitle className="mt-1 text-2xl tabular-nums">
                {total}
              </CardTitle>
            ) : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
        {caption ? (
          <p className="text-xs text-muted-foreground">{caption}</p>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface SeriesLegendItem {
  label: string;
  /** Tailwind text-colour class; the swatch inherits it via `currentColor`. */
  colorClass: string;
}

/** Colour key for a multi-series chart (e.g. buyers vs sellers signups). */
export function SeriesLegend({ items }: { items: SeriesLegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground",
            item.colorClass,
          )}
        >
          <span
            aria-hidden
            className="size-2 rounded-full bg-current"
          />
          <span className="text-muted-foreground">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
