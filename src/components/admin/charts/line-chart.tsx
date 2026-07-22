/**
 * A dependency-free SVG line/area chart for the admin analytics page
 * (spec §4.1.5). Pure server component: the geometry comes from
 * {@link ./geometry} (unit-tested) and the whole thing renders server-side with
 * no client JS.
 *
 * Zero-based y-axis with a handful of "nice" gridlines, a proportional
 * `viewBox` so it scales to the card width without distorting strokes, and one
 * or more colour-coded series (e.g. signups split by buyer vs seller).
 */
import { fmtCompact } from "@/app/admin/_lib/format";
import { buildLine, niceCeil, plotArea, resolveBox, yTicks } from "./geometry";

export interface LineSeries {
  label: string;
  values: number[];
  /**
   * Tailwind text-colour class; the stroke inherits it via `currentColor`.
   * Defaults to the primary hue.
   */
  colorClass?: string;
}

export interface LineChartProps {
  series: LineSeries[];
  /** UTC day keys the series are aligned to (drives the count + x-axis span). */
  dayKeys: string[];
  ariaLabel: string;
  /** Fill under the line — only honoured for a single series. */
  area?: boolean;
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
  // ymd is a UTC calendar day; format in UTC so it never drifts a day.
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LineChart({
  series,
  dayKeys,
  ariaLabel,
  area = false,
  height = 220,
  width = 720,
}: LineChartProps) {
  const box = resolveBox({ ...BOX, width, height });
  const plot = plotArea(box);
  const rawMax = series.flatMap((s) => s.values).reduce((m, v) => Math.max(m, v), 0);
  // One shared, nice-rounded axis so every series is visually comparable.
  const axisMax = niceCeil(rawMax);
  const lines = series.map((s) => ({
    series: s,
    geo: buildLine(s.values, { ...box, max: axisMax }),
  }));

  const ticks = yTicks(axisMax, 4);
  const plotLeft = box.padLeft;
  const plotRight = box.width - box.padRight;
  const baselineY = plot.y + plot.height;
  const yFor = (v: number) =>
    axisMax === 0 ? baselineY : baselineY - plot.height * (v / axisMax);

  const singleArea = area && lines.length === 1;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${box.width} ${box.height}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{ariaLabel}</title>

      {/* horizontal gridlines + y-axis labels */}
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

      {/* series */}
      {lines.map(({ series: s, geo }) => (
        <g key={s.label} className={s.colorClass ?? "text-primary"}>
          {singleArea ? (
            <polygon
              points={geo.area}
              fill="currentColor"
              fillOpacity={0.12}
              stroke="none"
            />
          ) : null}
          <polyline
            points={geo.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}

      {/* x-axis endpoints */}
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
