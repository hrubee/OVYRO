import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { absoluteUrl, listingPath, listingUrl, siteOrigin } from "./url";

const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = original;
});

describe("with NEXT_PUBLIC_APP_URL set", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ovyro.com/";
  });

  test("siteOrigin strips the trailing slash", () => {
    expect(siteOrigin()).toBe("https://ovyro.com");
  });

  test("absoluteUrl joins a path onto the origin", () => {
    expect(absoluteUrl("/land")).toBe("https://ovyro.com/land");
    expect(absoluteUrl("land")).toBe("https://ovyro.com/land");
  });

  test("listing helpers build the canonical landing URL", () => {
    expect(listingPath("prime-3-acre-plot")).toBe("/land/prime-3-acre-plot");
    expect(listingUrl("prime-3-acre-plot")).toBe(
      "https://ovyro.com/land/prime-3-acre-plot",
    );
  });
});

describe("without NEXT_PUBLIC_APP_URL", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  test("falls back to localhost", () => {
    expect(siteOrigin()).toBe("http://localhost:3000");
    expect(listingUrl("x")).toBe("http://localhost:3000/land/x");
  });
});
