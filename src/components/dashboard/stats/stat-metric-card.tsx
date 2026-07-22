/**
 * One metric tile on the seller listing-stats page: an all-time total headline
 * plus a sparkline per time window (7- and 30-day). Takes plain primitives so
 * it stays decoupled from the analytics DTOs and trivial to render.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkline } from "./sparkline";

const countFmt = new Intl.NumberFormat("en-US");

export interface StatWindow {
  /** Short window label, e.g. "7 days". */
  label: string;
  /** Sum over the window. */
  total: number;
  /** Daily values, oldest → newest. */
  values: number[];
}

export interface StatMetricCardProps {
  /** Metric name, e.g. "Views". */
  label: string;
  /** All-time total from the denormalized counter. */
  total: number;
  windows: StatWindow[];
}

export function StatMetricCard({ label, total, windows }: StatMetricCardProps) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {countFmt.format(total)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {windows.map((window) => (
          <div key={window.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>Last {window.label}</span>
              <span className="tabular-nums font-medium text-foreground">
                {countFmt.format(window.total)}
              </span>
            </div>
            <Sparkline
              values={window.values}
              label={`${label} over the last ${window.label}`}
              className="h-8 w-full"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
