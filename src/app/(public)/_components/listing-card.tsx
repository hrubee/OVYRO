import Link from "next/link";
import type { ListingSummary } from "@/lib/listings";
import {
  formatArea,
  formatLocation,
  formatPrice,
  landTypeLabel,
  listingPath,
} from "@/lib/search";
import { cn } from "@/lib/utils";
import { CoverImage } from "./cover-image";

/**
 * A single browse result. `layout="grid"` stacks (image over details);
 * `layout="list"` places the image beside the details on wider viewports.
 * The whole card is one link to the listing landing page.
 */
export function ListingCard({
  listing,
  layout = "grid",
  priority = false,
}: {
  listing: ListingSummary;
  layout?: "grid" | "list";
  priority?: boolean;
}) {
  const location = formatLocation(listing);
  const isList = layout === "list";

  return (
    <Link
      href={listingPath(listing.slug)}
      className={cn(
        "group flex overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isList ? "flex-col sm:flex-row" : "flex-col",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden bg-muted",
          isList ? "aspect-[4/3] sm:aspect-auto sm:w-64" : "aspect-[4/3]",
        )}
      >
        <CoverImage
          src={listing.coverImageUrl}
          alt={listing.title}
          sizes={isList ? "(max-width: 640px) 100vw, 16rem" : "(max-width: 768px) 100vw, 320px"}
          priority={priority}
          className="transition-transform duration-300 group-hover:scale-105"
        />
        {listing.featured && (
          <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            Featured
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold tracking-tight">
            {formatPrice(listing.price, listing.currency)}
          </span>
          {listing.negotiable && (
            <span className="text-xs text-muted-foreground">Negotiable</span>
          )}
        </div>
        <h3 className="line-clamp-2 font-medium leading-snug">{listing.title}</h3>
        <p className="text-sm text-muted-foreground">
          {formatArea(listing.area, listing.areaUnit)} · {landTypeLabel(listing.landType)}
        </p>
        {location && (
          <p className="truncate text-sm text-muted-foreground">{location}</p>
        )}
      </div>
    </Link>
  );
}
