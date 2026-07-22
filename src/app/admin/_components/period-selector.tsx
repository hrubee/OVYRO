"use client";

/**
 * The 7/30/90-day period selector for the admin overview (spec §4.1.1) and the
 * range selector on the analytics page (spec §4.1.5). Drives a URL search param
 * so the selected window is server-rendered, shareable, and back-button-safe —
 * no client data fetching. Reusable via the `param` + `options` props.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PeriodSelectorProps {
  options: readonly number[];
  current: number;
  /** Search-param name to write, e.g. "period" or "days". */
  param?: string;
  /** Accessible label for the group. */
  label?: string;
}

export function PeriodSelector({
  options,
  current,
  param = "period",
  label = "Time period",
}: PeriodSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(value: number) {
    const next = new URLSearchParams(searchParams);
    next.set(param, String(value));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-lg border bg-background p-0.5"
    >
      {options.map((option) => {
        const active = option === current;
        return (
          <button
            key={option}
            type="button"
            onClick={() => select(option)}
            aria-pressed={active}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}d
          </button>
        );
      })}
    </div>
  );
}
