import { LayoutGrid, Rows3 } from "lucide-react";
import Link from "next/link";
import type { ListingSearchParams } from "@/lib/search";
import { cn } from "@/lib/utils";
import { browseHref, type BrowseView } from "./browse-links";

/** Grid/list layout switch — plain links, so it works without client JS. */
export function ViewToggle({
  params,
  view,
}: {
  params: ListingSearchParams;
  view: BrowseView;
}) {
  const base =
    "inline-flex size-8 items-center justify-center rounded-md border transition-colors";
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Result layout">
      <Link
        href={browseHref(params, { view: "grid" })}
        aria-label="Grid view"
        aria-current={view === "grid" ? "true" : undefined}
        className={cn(
          base,
          view === "grid" ? "bg-accent text-accent-foreground" : "hover:bg-accent",
        )}
      >
        <LayoutGrid className="size-4" />
      </Link>
      <Link
        href={browseHref(params, { view: "list" })}
        aria-label="List view"
        aria-current={view === "list" ? "true" : undefined}
        className={cn(
          base,
          view === "list" ? "bg-accent text-accent-foreground" : "hover:bg-accent",
        )}
      >
        <Rows3 className="size-4" />
      </Link>
    </div>
  );
}
