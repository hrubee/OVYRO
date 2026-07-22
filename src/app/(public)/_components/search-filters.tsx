import Link from "next/link";
import { areaUnit, landType } from "@/lib/db/schema";
import {
  areaUnitLabel,
  landTypeLabel,
  LISTING_SORTS,
  type ListingSearchParams,
  type ListingSort,
} from "@/lib/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SORT_LABELS: Record<ListingSort, string> = {
  newest: "Newest",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  area_asc: "Area: Small to Large",
  area_desc: "Area: Large to Small",
  popularity: "Most Popular",
};

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Browse filter/sort controls (spec §4.2.1). A plain GET `<form>` that
 * navigates to `/land?…`, so filtering works with zero client JavaScript and
 * every result URL is shareable. Submitting drops `cursor`, resetting to the
 * first page; `view` is preserved via a hidden field.
 */
export function SearchFilters({
  params,
  regions,
  view,
}: {
  params: ListingSearchParams;
  regions: string[];
  view: "grid" | "list";
}) {
  return (
    <form
      method="get"
      action="/land"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <input type="hidden" name="view" value={view} />

      <label className="block">
        <FieldLabel>Search</FieldLabel>
        <Input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Location, keyword, survey no…"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <FieldLabel>Region</FieldLabel>
          <select name="region" defaultValue={params.region ?? ""} className={fieldClass}>
            <option value="">All regions</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <FieldLabel>Land type</FieldLabel>
          <select name="landType" defaultValue={params.landType ?? ""} className={fieldClass}>
            <option value="">All types</option>
            {landType.enumValues.map((value) => (
              <option key={value} value={value}>
                {landTypeLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="sr-only">Price range</legend>
        <label className="block">
          <FieldLabel>Min price</FieldLabel>
          <Input type="number" name="priceMin" min="0" defaultValue={params.priceMin ?? ""} />
        </label>
        <label className="block">
          <FieldLabel>Max price</FieldLabel>
          <Input type="number" name="priceMax" min="0" defaultValue={params.priceMax ?? ""} />
        </label>
      </fieldset>

      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="sr-only">Area range</legend>
        <label className="block">
          <FieldLabel>Unit</FieldLabel>
          <select name="areaUnit" defaultValue={params.areaUnit ?? ""} className={fieldClass}>
            <option value="">Any unit</option>
            {areaUnit.enumValues.map((value) => (
              <option key={value} value={value}>
                {areaUnitLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <FieldLabel>Min area</FieldLabel>
          <Input type="number" name="areaMin" min="0" step="any" defaultValue={params.areaMin ?? ""} />
        </label>
        <label className="block">
          <FieldLabel>Max area</FieldLabel>
          <Input type="number" name="areaMax" min="0" step="any" defaultValue={params.areaMax ?? ""} />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">
          Amenities
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="roadAccess"
            value="true"
            defaultChecked={params.roadAccess === true}
            className="size-4 rounded border-input"
          />
          Road access
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="water"
            value="true"
            defaultChecked={params.water === true}
            className="size-4 rounded border-input"
          />
          Water supply
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="electricity"
            value="true"
            defaultChecked={params.electricity === true}
            className="size-4 rounded border-input"
          />
          Electricity
        </label>
      </fieldset>

      <label className="block">
        <FieldLabel>Sort by</FieldLabel>
        <select name="sort" defaultValue={params.sort} className={fieldClass}>
          {LISTING_SORTS.map((value) => (
            <option key={value} value={value}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Apply filters
        </Button>
        <Button variant="outline" asChild>
          <Link href="/land">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
