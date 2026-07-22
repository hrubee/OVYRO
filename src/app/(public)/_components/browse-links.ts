import { listingSearchToQuery, type ListingSearchParams } from "@/lib/search";

export type BrowseView = "grid" | "list";

/**
 * Build a `/land` href that preserves the active filters/sort while changing
 * one axis (view, cursor, sort). `view` lives outside `ListingSearchParams`
 * (it is a presentation-only concern) so it is appended here, and only when
 * non-default (`list`) to keep URLs clean.
 */
export function browseHref(
  params: Partial<ListingSearchParams>,
  opts: { view?: BrowseView; overrides?: Partial<ListingSearchParams> } = {},
): string {
  const query = listingSearchToQuery(params, opts.overrides ?? {});
  const parts: string[] = [];
  if (query) parts.push(query);
  if (opts.view === "list") parts.push("view=list");
  const qs = parts.join("&");
  return qs ? `/land?${qs}` : "/land";
}
