/**
 * Meta connection health on the `/admin` overview (spec §4.1.1, §10). Shows the
 * connected-seller count + share of sellers, then breaks it into ad-account
 * connected, pixel configured, and healthy (active + an event in the last 7d).
 *
 * The spec is emphatic that a connection sending no events is effectively broken
 * — so "not sending events" (connected − healthy) is surfaced distinctly, in a
 * warning tone, rather than being hidden inside the connected count. Pure server
 * component.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtCount, fmtRatio, fmtShare } from "@/app/admin/_lib/format";
import type { MetaConnectionStats } from "@/lib/analytics";

function Row({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span
        className={cn(
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-destructive",
          tone === "default" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="tabular-nums">
        <span className="font-semibold text-foreground">{value}</span>
        {detail ? (
          <span className="ml-1.5 text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </div>
  );
}

export function MetaHealthCard({ meta }: { meta: MetaConnectionStats }) {
  const notSendingEvents = Math.max(0, meta.connected - meta.healthy);

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="gap-1">
        <CardDescription>Meta-connected sellers</CardDescription>
        <div className="flex items-baseline gap-2">
          <CardTitle className="text-3xl tabular-nums">
            {fmtCount(meta.connected)}
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {fmtRatio(meta.pct == null ? null : meta.pct / 100, 0)} of sellers
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Row
          label="Ad account connected"
          value={fmtCount(meta.adAccountConnected)}
          detail={fmtShare(meta.adAccountConnected, meta.connected)}
        />
        <Row
          label="Pixel configured"
          value={fmtCount(meta.pixelConfigured)}
          detail={fmtShare(meta.pixelConfigured, meta.connected)}
        />
        <Row
          label="Healthy (events < 7d)"
          value={fmtCount(meta.healthy)}
          detail={fmtShare(meta.healthy, meta.connected)}
          tone="good"
        />
        <Row
          label="Connected, no events"
          value={fmtCount(notSendingEvents)}
          detail={fmtShare(notSendingEvents, meta.connected)}
          tone={notSendingEvents > 0 ? "warn" : "default"}
        />
      </CardContent>
    </Card>
  );
}
