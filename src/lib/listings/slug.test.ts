import { describe, expect, test } from "bun:test";
import { pickAvailableSlug, slugify } from "./slug";

describe("slugify", () => {
  test("kebab-cases and lowercases", () => {
    expect(slugify("Prime 3-Acre Plot")).toBe("prime-3-acre-plot");
  });

  test("ascii-folds diacritics", () => {
    expect(slugify("Nashik Café résumé")).toBe("nashik-cafe-resume");
  });

  test("collapses punctuation runs and trims stray hyphens", () => {
    expect(slugify("  Plot!!! @ Nashik --- (near lake)  ")).toBe(
      "plot-nashik-near-lake",
    );
  });

  test("drops non-latin scripts, falling back when nothing remains", () => {
    expect(slugify("नाशिक")).toBe("listing");
    expect(slugify("")).toBe("listing");
    expect(slugify("!!!")).toBe("listing");
  });

  test("truncates long titles without leaving a trailing hyphen", () => {
    const slug = slugify("a".repeat(50) + " " + "b".repeat(50));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("pickAvailableSlug", () => {
  test("returns the base when free", () => {
    expect(pickAvailableSlug("plot", new Set())).toBe("plot");
  });

  test("appends -2 on first collision", () => {
    expect(pickAvailableSlug("plot", new Set(["plot"]))).toBe("plot-2");
  });

  test("walks forward past taken variants", () => {
    expect(pickAvailableSlug("plot", new Set(["plot", "plot-2", "plot-3"]))).toBe(
      "plot-4",
    );
  });

  test("skips only the taken variants, not the gaps", () => {
    expect(pickAvailableSlug("plot", new Set(["plot", "plot-3"]))).toBe("plot-2");
  });
});
