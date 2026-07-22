import { describe, expect, test } from "bun:test";
import {
  serializeList,
  serializeSavedItem,
  type ListItemRow,
  type ListRow,
  type SavedListingDTO,
} from "./types";

const listRow: ListRow = {
  id: "list_1",
  userId: "user_1",
  name: "Wishlist",
  isDefault: true,
  deletedAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-02T00:00:00.000Z"),
};

const itemRow: ListItemRow = {
  id: "item_1",
  listId: "list_1",
  listingId: "listing_1",
  priceAtSave: "1250000.00",
  createdAt: new Date("2026-07-03T00:00:00.000Z"),
  updatedAt: new Date("2026-07-03T00:00:00.000Z"),
};

const listing: SavedListingDTO = {
  id: "listing_1",
  slug: "sunny-acre",
  title: "Sunny Acre",
  status: "active",
  removed: false,
  price: 1300000,
  currency: "INR",
  coverImageUrl: "https://img.example/cover.jpg",
};

describe("serializeList", () => {
  test("emits ISO timestamps and the supplied item count", () => {
    expect(serializeList(listRow, 4)).toEqual({
      id: "list_1",
      name: "Wishlist",
      isDefault: true,
      itemCount: 4,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
  });
});

describe("serializeSavedItem", () => {
  test("coerces price_at_save from string to number and nests the listing", () => {
    const dto = serializeSavedItem(itemRow, listing);
    expect(dto.priceAtSave).toBe(1250000);
    expect(dto.savedAt).toBe("2026-07-03T00:00:00.000Z");
    expect(dto.listing).toEqual(listing);
  });

  test("keeps a null snapshot price null", () => {
    const dto = serializeSavedItem({ ...itemRow, priceAtSave: null }, listing);
    expect(dto.priceAtSave).toBeNull();
  });
});
