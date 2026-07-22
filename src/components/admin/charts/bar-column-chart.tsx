/**
 * A dependency-free SVG column (vertical-bar) chart for the admin analytics page
 * (spec §4.1.5) — used for daily counts such as leads per day. Pure server
 * component; bar geometry comes from {@link ./geometry} (unit-tested).
 */
import { fmtCompact } from "@/app/admin/_lib/format";
import { buildBars, plotArea, resolveBox, yTicks } from "./geometry";

export interface BarColumnChartProps {
  values: number[];
  dayKeys: string[];
  ariaLabel: string;
  colorClass?: string;
  height?: number;
  width?: number;
}

const BOX = {
  padTop: 10,
  padRight: 12,
  padBottom: 22,
  padLeft: 44,
};

function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function BarColumnChart({
  values,
  dayKeys,
  ariaLabel,
  colorClass = "text-primary",
  height = 220,
  width = 720,
}: BarColumnChartProps) {
  const box = resolveBox({ ...BOX, width, height });
  const plot = plotArea(box);
  const { bars, max, baselineY } = buildBars(values, { ...box, gap: 0.35 });
  const ticks = yTicks(max, 4);
  const plotLeft = box.padLeft;
  const plotRight = box.width - box.padRight;
  const yFor = (v: number) =>
    max === 0 ? baselineY : baselineY - plot.height * (v / max);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${box.width} ${box.height}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{ariaLabel}</title>

      {ticks.map((t) => {
        const y = yFor(t);
        return (
          <g key={t}>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={plotLeft - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              {fmtCompact(t)}
            </text>
          </g>
        );
      })}

      <g className={colorClass}>
        {bars.map((bar, i) => (
          <rect
            key={dayKeys[i] ?? i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={1}
            fill="currentColor"
            fillOpacity={0.85}
          />
        ))}
      </g>

      {dayKeys.length > 0 ? (
        <>
          <text
            x={plotLeft}
            y={box.height - 6}
            textAnchor="start"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {fmtDay(dayKeys[0])}
          </text>
          <text
            x={plotRight}
            y={box.height - 6}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {fmtDay(dayKeys[dayKeys.length - 1])}
          </text>
        </>
      ) : null}
    </svg>
  );
}
