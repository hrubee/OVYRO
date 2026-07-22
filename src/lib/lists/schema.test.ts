import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LIST_NAME,
  DEFAULT_LIST_TOKEN,
  createListSchema,
  listNameSchema,
  renameListSchema,
} from "./schema";

describe("listNameSchema", () => {
  test("trims surrounding whitespace", () => {
    expect(listNameSchema.parse("  Beach plots  ")).toBe("Beach plots");
  });

  test("rejects an empty / whitespace-only name", () => {
    expect(listNameSchema.safeParse("").success).toBe(false);
    expect(listNameSchema.safeParse("   ").success).toBe(false);
  });

  test("rejects a name over 60 characters", () => {
    expect(listNameSchema.safeParse("a".repeat(61)).success).toBe(false);
    expect(listNameSchema.safeParse("a".repeat(60)).success).toBe(true);
  });
});

describe("createListSchema / renameListSchema", () => {
  test("parse a valid { name } body", () => {
    expect(createListSchema.parse({ name: "Investment" })).toEqual({
      name: "Investment",
    });
    expect(renameListSchema.parse({ name: "  Renamed " })).toEqual({
      name: "Renamed",
    });
  });

  test("reject a missing name", () => {
    expect(createListSchema.safeParse({}).success).toBe(false);
  });
});

describe("constants", () => {
  test("default token + name are stable", () => {
    expect(DEFAULT_LIST_TOKEN).toBe("default");
    expect(DEFAULT_LIST_NAME).toBe("Wishlist");
  });
});
