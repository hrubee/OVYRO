/**
 * One headline KPI tile on the `/admin` overview (spec §4.1.1): a label, a big
 * number, an optional "vs previous period" trend chip, and an optional caption
 * or breakdown slot beneath. Takes plain strings so it stays decoupled from the
 * analytics DTOs. Pure server component.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Trend } from "@/lib/analytics";
import { TrendBadge } from "./trend-badge";

export interface KpiCardProps {
  label: string;
  value: string;
  trend?: Trend;
  /** Whether a decrease is the good direction (passed through to the chip). */
  invertTrend?: boolean;
  /** One-line caption directly under the value (e.g. "of 1,204 registered"). */
  caption?: string;
  /** A richer breakdown slot (e.g. a buyers/sellers split). */
  children?: React.ReactNode;
}

export function KpiCard({
  label,
  value,
  trend,
  invertTrend,
  caption,
  children,
}: KpiCardProps) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
          {trend ? <TrendBadge trend={trend} invert={invertTrend} /> : null}
        </div>
        {caption ? (
          <p className="text-xs text-muted-foreground">{caption}</p>
        ) : null}
      </CardHeader>
      {children ? (
        <CardContent className="text-sm text-muted-foreground">
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}
