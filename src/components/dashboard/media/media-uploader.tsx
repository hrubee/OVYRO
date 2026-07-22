"use client";

/**
 * Seller media uploader (spec §4.3.1). Drives the Phase 1 photo pipeline:
 * presign -> direct PUT to R2 -> complete (registers the row + enqueues
 * processing) -> drag-to-reorder / delete. Bytes go straight to R2; this
 * component never posts file data to the Next.js app.
 *
 * The blurhash placeholder is rendered while a photo is still processing, so the
 * grid shows a colour-accurate stand-in before the webp variants are ready.
 */
import { decode } from "blurhash";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ListingMediaDTO } from "@/lib/listings";

/** Mirrors the server caps in `src/app/api/dashboard/media/shared.ts`. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_PHOTOS = 25;
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

interface PresignResponse {
  mediaId: string;
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
  method: string;
  headers: Record<string, string>;
}

interface UploaderItem extends ListingMediaDTO {
  /** Client-only upload phase before the server row exists. */
  localError?: string;
}

export interface MediaUploaderProps {
  listingId: string;
  initialMedia?: ListingMediaDTO[];
  className?: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export function MediaUploader({ listingId, initialMedia = [], className }: MediaUploaderProps) {
  const [items, setItems] = useState<UploaderItem[]>(initialMedia);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadOne = useCallback(
    async (file: File): Promise<UploaderItem | null> => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`${file.name}: unsupported type. Use JPG, PNG, WebP or HEIC.`);
        return null;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError(`${file.name}: larger than the 15 MB limit.`);
        return null;
      }

      const presignRes = await fetch("/api/dashboard/media/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!presignRes.ok) {
        setError(await readError(presignRes));
        return null;
      }
      const presign = (await presignRes.json()) as PresignResponse;

      const putRes = await fetch(presign.uploadUrl, {
        method: presign.method,
        headers: presign.headers,
        body: file,
      });
      if (!putRes.ok) {
        setError(`${file.name}: upload to storage failed.`);
        return null;
      }

      const completeRes = await fetch("/api/dashboard/media/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          mediaId: presign.mediaId,
          storageKey: presign.storageKey,
        }),
      });
      if (!completeRes.ok) {
        setError(await readError(completeRes));
        return null;
      }
      return (await completeRes.json()) as UploaderItem;
    },
    [listingId],
  );

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const room = MAX_PHOTOS - items.length;
    if (room <= 0) {
      setError(`A listing can have at most ${MAX_PHOTOS} photos.`);
      return;
    }
    const files = Array.from(fileList).slice(0, room);

    setBusy(true);
    try {
      for (const file of files) {
        const uploaded = await uploadOne(file);
        if (uploaded) setItems((current) => [...current, uploaded]);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function persistOrder(ordered: UploaderItem[]) {
    const previous = items;
    setItems(ordered);
    const res = await fetch("/api/dashboard/media/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, order: ordered.map((item) => item.id) }),
    });
    if (!res.ok) {
      setError(await readError(res));
      setItems(previous); // roll back the optimistic move
      return;
    }
    const body = (await res.json()) as { media: ListingMediaDTO[] };
    setItems(body.media);
  }

  function handleDrop(targetIndex: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    void persistOrder(next);
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/dashboard/media/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || items.length >= MAX_PHOTOS}
        >
          {busy ? "Uploading…" : "Add photos"}
        </Button>
        <span className="text-sm text-muted-foreground">
          {items.length}/{MAX_PHOTOS} · JPG, PNG, WebP or HEIC up to 15 MB
        </span>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <MediaThumb item={item} />
              {index === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                  Cover
                </span>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                aria-label="Remove photo"
                onClick={() => void handleDelete(item.id)}
                className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MediaThumb({ item }: { item: UploaderItem }) {
  if (item.processingStatus === "ready" && (item.thumbUrl ?? item.url)) {
    return (
      // Remote R2 media; next/image would need per-bucket host config, so a
      // plain img keeps the uploader self-contained.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={(item.thumbUrl ?? item.url) as string}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  return (
    <div className="relative h-full w-full">
      {item.blurhash ? <BlurhashCanvas hash={item.blurhash} /> : null}
      <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
        {item.processingStatus === "failed" ? "Failed" : "Processing…"}
      </span>
    </div>
  );
}

function BlurhashCanvas({ hash, size = 32 }: { hash: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    try {
      const pixels = decode(hash, size, size);
      const imageData = context.createImageData(size, size);
      imageData.data.set(pixels);
      context.putImageData(imageData, 0, 0);
    } catch {
      // An invalid hash just leaves the neutral background showing.
    }
  }, [hash, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="h-full w-full" />;
}
