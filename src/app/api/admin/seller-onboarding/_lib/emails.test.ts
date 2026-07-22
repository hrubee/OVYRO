import { describe, expect, test } from "bun:test";
import {
  sellerOnboardingApprovedEmail,
  sellerOnboardingRejectedEmail,
} from "./emails";

describe("sellerOnboardingApprovedEmail", () => {
  const email = sellerOnboardingApprovedEmail({ applicantName: "Ada Lovelace" });

  test("renders a subject, html and text", () => {
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.html.length).toBeGreaterThan(0);
    expect(email.text.length).toBeGreaterThan(0);
  });

  test("greets the applicant by name in both bodies", () => {
    expect(email.html).toContain("Ada Lovelace");
    expect(email.text).toContain("Ada Lovelace");
  });

  test("links to the seller dashboard", () => {
    expect(email.text).toContain("/dashboard");
  });
});

describe("sellerOnboardingRejectedEmail", () => {
  test("includes the reviewer note in both bodies", () => {
    const email = sellerOnboardingRejectedEmail({
      applicantName: "Grace Hopper",
      note: "Legal name did not match the ID.",
    });
    expect(email.html).toContain("Legal name did not match the ID.");
    expect(email.text).toContain("Legal name did not match the ID.");
  });

  test("escapes HTML in the note to prevent injection", () => {
    const email = sellerOnboardingRejectedEmail({
      applicantName: "Grace Hopper",
      note: "<script>alert(1)</script>",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    // The plain-text part keeps the raw note — only HTML needs escaping.
    expect(email.text).toContain("<script>alert(1)</script>");
  });

  test("escapes HTML in the applicant name", () => {
    const email = sellerOnboardingRejectedEmail({
      applicantName: "<b>Grace</b>",
      note: "reason",
    });
    expect(email.html).not.toContain("<b>Grace</b>");
    expect(email.html).toContain("&lt;b&gt;Grace&lt;/b&gt;");
  });
});
