import { PlaySquare } from "lucide-react";
import type { ListingMediaDTO } from "@/lib/listings";
import { CoverImage } from "../../../_components/cover-image";

/**
 * Listing photo gallery (spec §4.2.1 / §5.2). SSR-only: a hero photo over a
 * thumbnail grid, no client state. A labeled video slot is reserved for Phase 6
 * (Mux) so adding the player later does not reflow the page.
 */
export function ListingGallery({
  media,
  title,
}: {
  media: ListingMediaDTO[];
  title: string;
}) {
  const photos = media.filter((m) => m.kind === "photo" && m.url);
  const hasVideo = media.some((m) => m.kind === "video");
  const [hero, ...rest] = photos;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
        <CoverImage
          src={hero?.url ?? null}
          alt={hero ? title : `${title} — photos coming soon`}
          sizes="(max-width: 1024px) 100vw, 720px"
          priority
        />
      </div>

      {rest.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {rest.slice(0, 9).map((photo) => (
            <li
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-md bg-muted"
            >
              <CoverImage src={photo.url} alt={title} sizes="120px" />
            </li>
          ))}
        </ul>
      )}

      {/* Phase 6: the Mux video player mounts in this reserved slot. */}
      {hasVideo && (
        <div
          data-slot="listing-video"
          className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground"
        >
          <PlaySquare className="size-4" /> Video tour coming soon
        </div>
      )}
    </div>
  );
}
