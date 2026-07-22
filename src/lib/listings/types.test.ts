import { describe, expect, test } from "bun:test";
import {
  serialize,
  serializeSummary,
  type ListingMediaRow,
  type ListingRow,
} from "./types";

const baseRow: ListingRow = {
  id: "lst_1",
  sellerId: "usr_1",
  slug: "prime-plot",
  title: "Prime plot",
  description: "Nice",
  landType: "agricultural",
  // pg returns numeric columns as strings
  price: "2500000.00",
  currency: "INR",
  negotiable: true,
  area: "3.00",
  areaUnit: "acre",
  addressText: "Nashik",
  city: "Nashik",
  region: "Maharashtra",
  country: "IN",
  lat: 19.99,
  lng: 73.78,
  surveyNumber: "42/1",
  zoning: null,
  roadAccess: true,
  water: null,
  electricity: false,
  legalDocsAvailable: true,
  status: "active",
  rejectedReason: null,
  featured: false,
  publishedAt: new Date("2026-07-01T00:00:00.000Z"),
  expiresAt: null,
  deletedAt: null,
  viewCount: 12,
  saveCount: 3,
  leadCount: 1,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-02T00:00:00.000Z"),
};

const mediaRow = (over: Partial<ListingMediaRow>): ListingMediaRow => ({
  id: "med_1",
  listingId: "lst_1",
  kind: "photo",
  storageKey: "k",
  url: "https://cdn/p1.webp",
  thumbUrl: "https://cdn/p1-thumb.webp",
  blurhash: "LKO2",
  muxAssetId: null,
  processingStatus: "ready",
  sortOrder: 0,
  width: 1600,
  height: 900,
  durationS: null,
  bytes: 1000,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  ...over,
});

describe("serialize", () => {
  test("coerces numeric strings to numbers and dates to ISO", () => {
    const dto = serialize(baseRow);
    expect(dto.price).toBe(2_500_000);
    expect(dto.area).toBe(3);
    expect(typeof dto.price).toBe("number");
    expect(dto.publishedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(dto.expiresAt).toBeNull();
    expect(dto.createdAt).toBe("2026-06-01T00:00:00.000Z");
  });

  test("preserves nullable columns as null, not undefined", () => {
    const dto = serialize(baseRow);
    expect(dto.zoning).toBeNull();
    expect(dto.water).toBeNull();
    expect(dto.electricity).toBe(false);
  });

  test("sorts media by sortOrder and picks the first usable photo as cover", () => {
    const dto = serialize(baseRow, [
      mediaRow({ id: "b", sortOrder: 2, url: "https://cdn/b.webp" }),
      mediaRow({ id: "vid", sortOrder: 0, kind: "video", url: "https://cdn/v.m3u8" }),
      mediaRow({ id: "a", sortOrder: 1, url: "https://cdn/a.webp" }),
    ]);
    expect(dto.media.map((m) => m.id)).toEqual(["vid", "a", "b"]);
    // first photo by sort order — skips the video at 0
    expect(dto.coverImageUrl).toBe("https://cdn/a.webp");
  });

  test("cover is null when no photo has a resolved url yet", () => {
    const dto = serialize(baseRow, [
      mediaRow({ kind: "photo", url: null, processingStatus: "processing" }),
    ]);
    expect(dto.coverImageUrl).toBeNull();
    expect(dto.media).toHaveLength(1);
  });

  test("converts media duration_s numeric string to a number", () => {
    const dto = serialize(baseRow, [
      mediaRow({ kind: "video", durationS: "42.500", url: "https://cdn/v.m3u8" }),
    ]);
    expect(dto.media[0].durationS).toBe(42.5);
  });
});

describe("serializeSummary", () => {
  test("emits the public-safe subset and drops rejectedReason", () => {
    const summary = serializeSummary(baseRow, mediaRow({ url: "https://cdn/cover.webp" }));
    expect(summary.coverImageUrl).toBe("https://cdn/cover.webp");
    expect(summary.price).toBe(2_500_000);
    expect("rejectedReason" in summary).toBe(false);
    expect("description" in summary).toBe(false);
  });

  test("cover is null when none is supplied", () => {
    expect(serializeSummary(baseRow).coverImageUrl).toBeNull();
  });
});
