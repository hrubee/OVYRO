import { describe, expect, test } from "bun:test";
import {
  areaUnitLabel,
  formatArea,
  formatLocation,
  formatPrice,
  landTypeLabel,
} from "./format";

describe("formatPrice", () => {
  test("INR uses the lakh grouping and no decimals", () => {
    expect(formatPrice(1250000, "INR")).toBe("₹12,50,000");
  });

  test("lower-case currency codes are normalised", () => {
    expect(formatPrice(1250000, "inr")).toBe("₹12,50,000");
  });

  test("a malformed code degrades instead of throwing", () => {
    expect(formatPrice(1000, "US")).toBe("1,000 US");
  });
});

describe("formatArea", () => {
  test("pluralises countable units and trims decimals", () => {
    expect(formatArea(2.5, "acre")).toBe("2.5 acres");
    expect(formatArea(1, "acre")).toBe("1 acre");
  });

  test("leaves abbreviations unpluralised and groups thousands", () => {
    expect(formatArea(1000, "sqft")).toBe("1,000 sq ft");
  });
});

describe("labels", () => {
  test("landTypeLabel humanises the enum", () => {
    expect(landTypeLabel("residential_plot")).toBe("Residential Plot");
    expect(landTypeLabel("agricultural")).toBe("Agricultural");
  });

  test("areaUnitLabel pluralises only where it reads naturally", () => {
    expect(areaUnitLabel("acre", 2)).toBe("acres");
    expect(areaUnitLabel("acre", 1)).toBe("acre");
    expect(areaUnitLabel("sqft", 2)).toBe("sq ft");
  });
});

describe("formatLocation", () => {
  test("joins present parts and skips blanks", () => {
    expect(
      formatLocation({ city: "Ballari", region: "Karnataka", country: "IN" }),
    ).toBe("Ballari, Karnataka, IN");
    expect(formatLocation({ city: null, region: "Goa", country: null })).toBe("Goa");
    expect(formatLocation({ city: null, region: null, country: null })).toBe("");
  });
});
