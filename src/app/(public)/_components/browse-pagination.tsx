import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ListingSearchParams } from "@/lib/search";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { browseHref, type BrowseView } from "./browse-links";

/**
 * Forward keyset pagination (spec §7 "cursor pagination"). Keyset cursors are
 * forward-only, so we offer "Next" plus a "Start" reset; the browser's Back
 * button walks to prior pages (each page is its own cursor URL).
 */
export function BrowsePagination({
  params,
  nextCursor,
  view,
}: {
  params: ListingSearchParams;
  nextCursor: string | null;
  view: BrowseView;
}) {
  const onFirstPage = !params.cursor;
  if (onFirstPage && !nextCursor) return null;

  const link = cn(buttonVariants({ variant: "outline", size: "sm" }));

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
      {onFirstPage ? (
        <span />
      ) : (
        <Link
          href={browseHref(params, { view, overrides: { cursor: undefined } })}
          className={link}
        >
          <ArrowLeft className="size-4" /> Start
        </Link>
      )}
      {nextCursor ? (
        <Link
          href={browseHref(params, { view, overrides: { cursor: nextCursor } })}
          className={link}
        >
          Next <ArrowRight className="size-4" />
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">End of results</span>
      )}
    </nav>
  );
}
