"use client";

/**
 * Map-pin picker for a listing's location (spec §4.3.1 "map-pin drag for
 * lat/lng"). Deliberately built on the Mapbox *Static Images* API rendered into
 * a plain `<img>` — no `mapbox-gl` runtime dependency (deps are pinned for this
 * task). Clicking the map recenters the pin; the Web-Mercator math converts the
 * click's pixel offset from centre into a new lng/lat. Precise numeric inputs
 * sit alongside for accessibility and fine adjustment.
 *
 * With no `NEXT_PUBLIC_MAPBOX_TOKEN` configured, the interactive map is omitted
 * and the numeric inputs stand alone.
 */
import { useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const TILE_SIZE = 512;
const MAP_WIDTH = 600;
const MAP_HEIGHT = 320;
const PIN_ZOOM = 13;
// A sensible default view when nothing is placed yet (roughly India's centroid,
// matching the INR/`en` default market — the pin is only *set* once clicked).
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 3.5;

function project(lng: number, lat: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function unproject(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface MapPinPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}

export function MapPinPicker({ lat, lng, onChange }: MapPinPickerProps) {
  const imgRef = useRef<HTMLButtonElement>(null);

  const hasPin = lat !== null && lng !== null;
  const center = hasPin ? { lat, lng } : DEFAULT_CENTER;
  const zoom = hasPin ? PIN_ZOOM : DEFAULT_ZOOM;

  const handleMapClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const el = imgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;

      const world = project(center.lng, center.lat, zoom);
      const next = unproject(
        world.x + (px - rect.width / 2),
        world.y + (py - rect.height / 2),
        zoom,
      );
      onChange({ lat: round6(next.lat), lng: round6(next.lng) });
    },
    [center.lat, center.lng, zoom, onChange],
  );

  const staticUrl = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${center.lng},${center.lat},${zoom},0/${MAP_WIDTH}x${MAP_HEIGHT}?access_token=${MAPBOX_TOKEN}`
    : null;

  return (
    <div className="flex flex-col gap-3">
      {staticUrl ? (
        <button
          type="button"
          ref={imgRef}
          onClick={handleMapClick}
          aria-label="Set the listing location by clicking the map"
          className="relative block w-full overflow-hidden rounded-lg border"
          style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external, per-request map tile; not a static asset for next/image */}
          <img
            src={staticUrl}
            alt="Map preview of the listing location"
            className="h-full w-full object-cover"
          />
          {hasPin ? (
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-2xl leading-none"
            >
              📍
            </span>
          ) : (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-sm font-medium text-white">
              Click the map to drop a pin
            </span>
          )}
        </button>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Interactive map unavailable — enter coordinates below. (Set{" "}
          <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the map picker.)
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lat">Latitude</Label>
          <Input
            id="lat"
            inputMode="decimal"
            placeholder="e.g. 19.9975"
            value={lat ?? ""}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (e.target.value !== "" && !Number.isNaN(parsed)) {
                onChange({ lat: parsed, lng: lng ?? 0 });
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lng">Longitude</Label>
          <Input
            id="lng"
            inputMode="decimal"
            placeholder="e.g. 73.7898"
            value={lng ?? ""}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (e.target.value !== "" && !Number.isNaN(parsed)) {
                onChange({ lat: lat ?? 0, lng: parsed });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
