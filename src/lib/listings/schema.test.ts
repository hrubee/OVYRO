import { describe, expect, test } from "bun:test";
import { landType } from "@/lib/db/schema";
import { listingCreateSchema, listingEditSchema } from "./schema";

const minimalCreate = {
  title: "Prime 3-acre plot",
  landType: "agricultural" as const,
  price: 2_500_000,
  area: 3,
  areaUnit: "acre" as const,
};

describe("listingCreateSchema (spec §4.3.1)", () => {
  test("accepts a minimal draft and applies the column defaults", () => {
    const parsed = listingCreateSchema.parse(minimalCreate);
    expect(parsed.description).toBe("");
    expect(parsed.addressText).toBe("");
    expect(parsed.currency).toBe("INR");
    expect(parsed.negotiable).toBe(false);
    expect(parsed.legalDocsAvailable).toBe(false);
  });

  test("reuses the DB land_type enum (no drift)", () => {
    for (const value of landType.enumValues) {
      expect(listingCreateSchema.parse({ ...minimalCreate, landType: value }).landType).toBe(
        value,
      );
    }
    expect(() =>
      listingCreateSchema.parse({ ...minimalCreate, landType: "swampland" }),
    ).toThrow();
  });

  test("rejects a non-existent area_unit", () => {
    expect(() =>
      listingCreateSchema.parse({ ...minimalCreate, areaUnit: "furlong" }),
    ).toThrow();
  });

  test("price and area must be positive and within column precision", () => {
    expect(() => listingCreateSchema.parse({ ...minimalCreate, price: 0 })).toThrow();
    expect(() => listingCreateSchema.parse({ ...minimalCreate, price: -1 })).toThrow();
    expect(() =>
      listingCreateSchema.parse({ ...minimalCreate, price: 1_000_000_000_000 }),
    ).toThrow();
    expect(() => listingCreateSchema.parse({ ...minimalCreate, area: 0 })).toThrow();
  });

  test("normalizes currency and country to uppercase ISO codes", () => {
    const parsed = listingCreateSchema.parse({
      ...minimalCreate,
      currency: "usd",
      country: "in",
    });
    expect(parsed.currency).toBe("USD");
    expect(parsed.country).toBe("IN");
    expect(() => listingCreateSchema.parse({ ...minimalCreate, currency: "US" })).toThrow();
    expect(() =>
      listingCreateSchema.parse({ ...minimalCreate, country: "USA" }),
    ).toThrow();
  });

  test("lat/lng are bounded to valid coordinates", () => {
    expect(
      listingCreateSchema.parse({ ...minimalCreate, lat: 19.99, lng: 73.78 }).lat,
    ).toBe(19.99);
    expect(() => listingCreateSchema.parse({ ...minimalCreate, lat: 91 })).toThrow();
    expect(() => listingCreateSchema.parse({ ...minimalCreate, lng: -181 })).toThrow();
  });

  test("title is trimmed and length-bounded", () => {
    expect(listingCreateSchema.parse({ ...minimalCreate, title: "  Hello plot  " }).title).toBe(
      "Hello plot",
    );
    expect(() => listingCreateSchema.parse({ ...minimalCreate, title: "no" })).toThrow();
  });

  test("strict: server-owned fields cannot be mass-assigned", () => {
    expect(() =>
      listingCreateSchema.parse({ ...minimalCreate, status: "active" }),
    ).toThrow();
    expect(() =>
      listingCreateSchema.parse({ ...minimalCreate, sellerId: "u_hax", featured: true }),
    ).toThrow();
  });
});

describe("listingEditSchema (PATCH semantics)", () => {
  test("an empty patch is valid and applies no defaults", () => {
    const parsed = listingEditSchema.parse({});
    expect(parsed).toEqual({});
    expect("currency" in parsed).toBe(false);
    expect("negotiable" in parsed).toBe(false);
  });

  test("a partial patch validates only the provided fields", () => {
    const parsed = listingEditSchema.parse({ price: 999, negotiable: true });
    expect(parsed).toEqual({ price: 999, negotiable: true });
  });

  test("still enforces the field rules and strictness", () => {
    expect(() => listingEditSchema.parse({ price: -5 })).toThrow();
    expect(() => listingEditSchema.parse({ status: "active" })).toThrow();
  });
});
