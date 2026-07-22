import { SearchX } from "lucide-react";
import type { ListingSummary } from "@/lib/listings";
import { cn } from "@/lib/utils";
import { ListingCard } from "./listing-card";

/**
 * Renders a page of listings as a responsive grid or a single-column list.
 * The first few covers are marked `priority` for a better LCP on the ad-landed
 * fold. Shows an empty state when there are no results.
 */
export function ListingGrid({
  listings,
  layout = "grid",
  emptyMessage = "No listings match your filters yet.",
}: {
  listings: ListingSummary[];
  layout?: "grid" | "list";
  emptyMessage?: string;
}) {
  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
        <SearchX className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        layout === "grid"
          ? "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "flex flex-col gap-4",
      )}
    >
      {listings.map((listing, index) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          layout={layout}
          priority={index < 4}
        />
      ))}
    </div>
  );
}
