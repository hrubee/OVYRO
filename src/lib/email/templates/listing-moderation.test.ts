import { afterEach, describe, expect, test } from "bun:test";
import {
  appOrigin,
  listingApprovedEmail,
  listingExpiredEmail,
  listingRejectedEmail,
  listingUrl,
  sellerListingsUrl,
} from "./listing-moderation";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

describe("URL helpers", () => {
  test("appOrigin strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ovyro.example///";
    expect(appOrigin()).toBe("https://ovyro.example");
  });

  test("appOrigin falls back to the production origin", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appOrigin()).toBe("https://ovyro.com");
  });

  test("listingUrl points at the public /land/[slug] page", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ovyro.example";
    expect(listingUrl("prime-3-acre-plot")).toBe(
      "https://ovyro.example/land/prime-3-acre-plot",
    );
  });

  test("sellerListingsUrl points at the dashboard", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ovyro.example";
    expect(sellerListingsUrl()).toBe("https://ovyro.example/dashboard/listings");
  });
});

describe("listingApprovedEmail", () => {
  const email = listingApprovedEmail({
    sellerName: "Asha",
    listingTitle: "Prime 3-Acre Plot",
    listingUrl: "https://ovyro.example/land/prime-3-acre-plot",
  });

  test("subject and body name the listing and link to it", () => {
    expect(email.subject).toContain("Prime 3-Acre Plot");
    expect(email.html).toContain("https://ovyro.example/land/prime-3-acre-plot");
    expect(email.text).toContain("https://ovyro.example/land/prime-3-acre-plot");
    expect(email.text).toContain("Asha");
  });
});

describe("listingRejectedEmail", () => {
  test("includes the reason and an edit link", () => {
    const email = listingRejectedEmail({
      sellerName: "Asha",
      listingTitle: "Prime Plot",
      reason: "Survey number does not match the title deed.",
      editUrl: "https://ovyro.example/dashboard/listings",
    });
    expect(email.subject).toContain("Prime Plot");
    expect(email.html).toContain("Survey number does not match the title deed.");
    expect(email.text).toContain("Survey number does not match the title deed.");
    expect(email.html).toContain("https://ovyro.example/dashboard/listings");
  });

  test("escapes HTML in untrusted title and reason", () => {
    const email = listingRejectedEmail({
      sellerName: "Asha",
      listingTitle: "<script>alert(1)</script>",
      reason: "Contains <b>markup</b> & symbols",
      editUrl: "https://ovyro.example/dashboard/listings",
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp;");
  });
});

describe("listingExpiredEmail", () => {
  test("prompts a renew with the listing link", () => {
    const email = listingExpiredEmail({
      sellerName: "Asha",
      listingTitle: "Prime Plot",
      renewUrl: "https://ovyro.example/land/prime-plot",
    });
    expect(email.subject).toContain("expired");
    expect(email.html).toContain("https://ovyro.example/land/prime-plot");
    expect(email.text.toLowerCase()).toContain("renew");
  });
});
