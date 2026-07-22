import type { Metadata } from "next";
import { db } from "@/lib/db";
import {
  fetchActiveRegions,
  parseListingSearch,
  searchPublicListings,
} from "@/lib/search";
import { BrowsePagination } from "../_components/browse-pagination";
import { ListingGrid } from "../_components/listing-grid";
import { SearchFilters } from "../_components/search-filters";
import { SiteHeader } from "../_components/site-header";
import { ViewToggle } from "../_components/view-toggle";

export const metadata: Metadata = {
  title: "Browse land",
  description:
    "Search and filter land-only parcels for sale on Ovyro by location, price, area, land type, and amenities.",
};

/** Next 15 delivers `searchParams` as a promise. */
type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

export default async function BrowseLandPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  const raw = await searchParams;
  const params = parseListingSearch(raw);
  const view = raw.view === "list" ? "list" : "grid";

  const [result, regions] = await Promise.all([
    searchPublicListings(db, params),
    fetchActiveRegions(db),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Browse land</h1>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <SearchFilters params={params} regions={regions} view={view} />
          </aside>

          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {result.items.length === 0
                  ? "No results"
                  : `Showing ${result.items.length} listing${result.items.length === 1 ? "" : "s"}`}
              </p>
              <ViewToggle params={params} view={view} />
            </div>

            <ListingGrid listings={result.items} layout={view} />

            <BrowsePagination
              params={params}
              nextCursor={result.nextCursor}
              view={view}
            />
          </section>
        </div>
      </main>
    </>
  );
}
