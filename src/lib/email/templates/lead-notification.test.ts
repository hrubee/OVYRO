import { afterEach, describe, expect, test } from "bun:test";
import { leadNotificationEmail, sellerLeadsUrl } from "./lead-notification";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

describe("sellerLeadsUrl", () => {
  test("points at the seller lead inbox", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ovyro.example";
    expect(sellerLeadsUrl()).toBe("https://ovyro.example/dashboard/leads");
  });
});

describe("leadNotificationEmail", () => {
  const base = {
    sellerName: "Asha",
    buyerName: "Ravi",
    listingTitle: "Prime 3-Acre Plot",
    listingUrl: "https://ovyro.example/land/prime-3-acre-plot",
    preferredContact: "WhatsApp",
    buyerPhone: "+919876543210",
    buyerEmail: "ravi@example.com",
    leadsUrl: "https://ovyro.example/dashboard/leads",
  };

  test("names the buyer, listing, offer, and contact details", () => {
    const email = leadNotificationEmail({
      ...base,
      offerText: "₹12,00,000",
      message: "Is the survey number clear?",
    });
    expect(email.subject).toContain("Prime 3-Acre Plot");
    expect(email.html).toContain("Ravi");
    expect(email.html).toContain("₹12,00,000");
    expect(email.html).toContain("+919876543210");
    expect(email.html).toContain("ravi@example.com");
    expect(email.html).toContain("Is the survey number clear?");
    expect(email.html).toContain("https://ovyro.example/dashboard/leads");
    expect(email.text).toContain("Ravi");
    expect(email.text).toContain("Is the survey number clear?");
  });

  test("shows 'At asking price' when there is no offer", () => {
    const email = leadNotificationEmail({ ...base, offerText: null, message: null });
    expect(email.html).toContain("At asking price");
    expect(email.text).toContain("At asking price");
  });

  test("omits the email row and message block when absent", () => {
    const email = leadNotificationEmail({
      ...base,
      buyerEmail: null,
      offerText: null,
      message: null,
    });
    expect(email.html).not.toContain("Email");
    expect(email.text).not.toContain("Email:");
    expect(email.html).not.toContain("Message");
  });

  test("escapes HTML in untrusted buyer name and message", () => {
    const email = leadNotificationEmail({
      ...base,
      buyerName: "<script>alert(1)</script>",
      message: "cash & <b>ready</b>",
      offerText: null,
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp;");
  });
});
