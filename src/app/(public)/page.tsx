import Link from "next/link";
import { db } from "@/lib/db";
import { parseListingSearch, searchPublicListings } from "@/lib/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListingGrid } from "./_components/listing-grid";
import { SiteHeader } from "./_components/site-header";

/**
 * The home page shows live listings, so it renders per request rather than at
 * build time (the DB is not reachable during `next build`). SSR keeps it fast
 * and SEO-friendly; the browse/detail pages are the ISR/edge-cache targets.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { items } = await searchPublicListings(
    db,
    parseListingSearch({ sort: "newest", limit: "8" }),
  );

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b bg-muted/40">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-16 text-center sm:py-24">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Find land worth building on
            </h1>
            <p className="mx-auto max-w-2xl text-muted-foreground sm:text-lg">
              Browse land-only parcels with photos, pricing, and full parcel
              details. Save the ones you like and reach out to owners directly.
            </p>
            <form
              method="get"
              action="/land"
              className="mx-auto flex w-full max-w-xl gap-2"
            >
              <Input
                type="search"
                name="q"
                placeholder="Search by location, keyword, or survey number"
                aria-label="Search land listings"
              />
              <Button type="submit">Search</Button>
            </form>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">Latest listings</h2>
            <Link href="/land" className="text-sm font-medium hover:underline">
              Browse all land →
            </Link>
          </div>
          <ListingGrid
            listings={items}
            emptyMessage="No listings published yet — check back soon."
          />
        </section>
      </main>
    </>
  );
}
