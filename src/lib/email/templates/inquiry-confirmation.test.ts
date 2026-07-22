import { afterEach, describe, expect, test } from "bun:test";
import {
  buyerInquiriesUrl,
  inquiryConfirmationEmail,
} from "./inquiry-confirmation";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

describe("buyerInquiriesUrl", () => {
  test("points at the buyer's inquiries page", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ovyro.example";
    expect(buyerInquiriesUrl()).toBe("https://ovyro.example/account/inquiries");
  });
});

describe("inquiryConfirmationEmail", () => {
  const base = {
    buyerName: "Ravi",
    listingTitle: "Prime 3-Acre Plot",
    listingUrl: "https://ovyro.example/land/prime-3-acre-plot",
    inquiriesUrl: "https://ovyro.example/account/inquiries",
  };

  test("confirms the inquiry and links to the inquiries page", () => {
    const email = inquiryConfirmationEmail({ ...base, offerText: "₹12,00,000" });
    expect(email.subject).toContain("Prime 3-Acre Plot");
    expect(email.html).toContain("Ravi");
    expect(email.html).toContain("₹12,00,000");
    expect(email.html).toContain("https://ovyro.example/account/inquiries");
    expect(email.text).toContain("₹12,00,000");
  });

  test("falls back to listed-price wording with no offer", () => {
    const email = inquiryConfirmationEmail({ ...base, offerText: null });
    expect(email.html).toContain("listed price");
    expect(email.text).toContain("listed price");
  });

  test("escapes HTML in the untrusted listing title", () => {
    const email = inquiryConfirmationEmail({
      ...base,
      listingTitle: "<script>alert(1)</script>",
      offerText: null,
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
