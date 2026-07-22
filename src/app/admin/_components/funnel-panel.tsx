/**
 * The acquisition funnel on the `/admin` overview (spec §4.1.1, §10):
 * listing views → inquiry starts → inquiries submitted, period-scoped, with the
 * headline conversion rate (`inquiries_submitted / listing_views`) and the
 * step-to-step rates. Bars are sized relative to the top of the funnel. Pure
 * server component.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtCount, fmtRatio } from "@/app/admin/_lib/format";
import type { Funnel, Trend } from "@/lib/analytics";
import { TrendBadge } from "./trend-badge";

export interface FunnelPanelProps {
  funnel: Funnel;
  /** Trend of inquiries submitted vs the previous period. */
  trend: Trend;
}

export function FunnelPanel({ funnel, trend }: FunnelPanelProps) {
  const top = funnel.views;
  const stages = [
    { label: "Listing views", value: funnel.views, rate: null as number | null },
    { label: "Inquiry starts", value: funnel.inquiryStarts, rate: funnel.startRate },
    {
      label: "Inquiries submitted",
      value: funnel.inquiriesSubmitted,
      rate: funnel.submitRate,
    },
  ];

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="gap-1">
        <CardDescription>Acquisition funnel</CardDescription>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-3xl tabular-nums">
            {fmtRatio(funnel.conversionRate)}
          </CardTitle>
          <TrendBadge trend={trend} />
        </div>
        <p className="text-xs text-muted-foreground">
          views → inquiry conversion this period
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {stages.map((stage) => {
          const width = top === 0 ? 0 : Math.max(2, (stage.value / top) * 100);
          return (
            <div key={stage.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{stage.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtCount(stage.value)}
                  {stage.rate != null ? (
                    <span className="ml-2 text-xs">
                      ({fmtRatio(stage.rate)} of prior)
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full bg-primary/80")}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
