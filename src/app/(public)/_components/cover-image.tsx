import { ImageOff } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Listing cover/photo with a graceful placeholder. Renders `next/image` (R2 /
 * Mux hosts are allow-listed in `next.config.ts`) when a resolved URL exists,
 * otherwise a neutral fallback — media may still be processing, or absent on a
 * freshly seeded listing. The parent must be `relative` and sized.
 */
export function CoverImage({
  src,
  alt,
  sizes,
  priority = false,
  className,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="size-8 opacity-60" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}
