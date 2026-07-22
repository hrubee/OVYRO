/**
 * A dependency-free SVG sparkline for the seller stats dashboard.
 *
 * Renders a value series as a normalized trendline + soft area fill, inheriting
 * its colour from `currentColor` so callers set the hue with a text class. Pure
 * (no hooks, no state) so it renders as a server component; the geometry lives
 * in {@link ./sparkline-path} and is unit-tested there.
 */
import { cn } from "@/lib/utils";
import { buildSparkline } from "./sparkline-path";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Accessible description, e.g. "Views over the last 7 days". */
  label: string;
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
  label,
}: SparklineProps) {
  const { line, area, width: w, height: h } = buildSparkline(values, {
    width,
    height,
  });
  const hasData = values.length > 0;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      preserveAspectRatio="none"
      className={cn("overflow-visible text-primary", className)}
    >
      <title>{label}</title>
      {hasData ? (
        <>
          <polygon
            points={area}
            fill="currentColor"
            fillOpacity={0.12}
            stroke="none"
          />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
    </svg>
  );
}
