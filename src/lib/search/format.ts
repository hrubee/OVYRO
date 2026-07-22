/**
 * Display formatting for listing browse/detail surfaces (spec §4.2.1).
 *
 * Pure and locale-deterministic so the same value renders identically on the
 * server (SSR) and in tests. INR is the launch currency (spec §A2) and uses the
 * Indian lakh/crore grouping; other currencies fall back to Western grouping.
 */
import type { AreaUnit, LandType } from "@/lib/listings";

const LAND_TYPE_LABELS: Record<LandType, string> = {
  agricultural: "Agricultural",
  residential_plot: "Residential Plot",
  commercial: "Commercial",
  industrial: "Industrial",
  recreational: "Recreational",
  other: "Other Land",
};

const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqft: "sq ft",
  sqm: "sq m",
  acre: "acre",
  hectare: "hectare",
  guntha: "guntha",
  cent: "cent",
  other: "unit",
};

/** Units that read naturally with a plural "s" (2 acres, not 2 sq ft). */
const PLURALIZABLE: ReadonlySet<AreaUnit> = new Set([
  "acre",
  "hectare",
  "guntha",
  "cent",
]);

export function landTypeLabel(landType: LandType): string {
  return LAND_TYPE_LABELS[landType] ?? "Land";
}

export function areaUnitLabel(unit: AreaUnit, quantity = 1): string {
  const label = AREA_UNIT_LABELS[unit] ?? "unit";
  return quantity !== 1 && PLURALIZABLE.has(unit) ? `${label}s` : label;
}

function localeFor(currency: string): string {
  return currency.toUpperCase() === "INR" ? "en-IN" : "en-US";
}

/** "₹12,50,000" — no fractional part; prices are whole-currency in the UI. */
export function formatPrice(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(localeFor(code), {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Unknown/invalid ISO code — degrade to a plain grouped number + code.
    return `${new Intl.NumberFormat("en-US").format(amount)} ${code}`;
  }
}

/** "2.5 acres", "1,000 sq ft" — up to two decimals, trailing zeros trimmed. */
export function formatArea(area: number, unit: AreaUnit): string {
  const value = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(area);
  return `${value} ${areaUnitLabel(unit, area)}`;
}

/** "Ballari, Karnataka" — joins the present location parts, skipping blanks. */
export function formatLocation(
  parts: { city?: string | null; region?: string | null; country?: string | null },
): string {
  return [parts.city, parts.region, parts.country]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(", ");
}
