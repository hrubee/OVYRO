/**
 * Transactional email bodies for a seller-onboarding decision (spec §4.2.4).
 *
 * Pure `(data) -> { subject, html, text }`, following the Phase-1 listing
 * moderation-email pattern: the producer (the admin review route) renders one
 * and hands the result to the `email` queue's `send` job, so nothing here
 * touches Resend, the DB, or a request. That keeps them trivially unit-testable.
 *
 * We reuse the dependency-free HTML shell from `@/lib/email/templates/_shared`
 * (its documented purpose) but keep the applicant-facing copy self-contained.
 */
import {
  emailButton,
  emailLayout,
  escapeHtml,
} from "@/lib/email/templates/_shared";

/** Fields the `email`/`send` job accepts. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Public origin used in every link. Trailing slashes stripped so joins are clean. */
function appOrigin(): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://ovyro.com";
  return origin.replace(/\/+$/, "");
}

/** Where a freshly-approved seller starts listing (spec §4.2). */
function sellerDashboardUrl(): string {
  return `${appOrigin()}/dashboard`;
}

/** Where a rejected applicant edits and resubmits their application. */
function onboardingUrl(): string {
  return `${appOrigin()}/onboarding/seller`;
}

export interface OnboardingApprovedEmailData {
  applicantName: string;
}

/** Sent when an admin approves an application — the seller role is now granted. */
export function sellerOnboardingApprovedEmail(
  data: OnboardingApprovedEmailData,
): RenderedEmail {
  const { applicantName } = data;
  const subject = "You're approved to sell on Ovyro";
  const html = emailLayout(
    "You're approved to sell",
    [
      `<p>Hi ${escapeHtml(applicantName)},</p>`,
      `<p>Good news — your seller application has been approved. Your account now has full selling access on top of everything you already had as a buyer.</p>`,
      `<p>Head to your dashboard to create your first land listing.</p>`,
      emailButton(sellerDashboardUrl(), "Go to your seller dashboard"),
    ].join(""),
  );
  const text = [
    `Hi ${applicantName},`,
    ``,
    `Good news — your seller application has been approved. Your account now has full selling access on top of everything you already had as a buyer.`,
    ``,
    `Create your first listing: ${sellerDashboardUrl()}`,
    ``,
    `— The Ovyro team`,
  ].join("\n");
  return { subject, html, text };
}

export interface OnboardingRejectedEmailData {
  applicantName: string;
  note: string;
}

/** Sent when an admin rejects an application — includes the reviewer's note. */
export function sellerOnboardingRejectedEmail(
  data: OnboardingRejectedEmailData,
): RenderedEmail {
  const { applicantName, note } = data;
  const subject = "An update on your Ovyro seller application";
  const html = emailLayout(
    "Your seller application needs another look",
    [
      `<p>Hi ${escapeHtml(applicantName)},</p>`,
      `<p>We reviewed your seller application and can't approve it as-is. Here's what our team noted:</p>`,
      `<blockquote style="margin:16px 0;padding:12px 16px;background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:4px;white-space:pre-wrap">${escapeHtml(note)}</blockquote>`,
      `<p>You can update your details and resubmit for another review.</p>`,
      emailButton(onboardingUrl(), "Update and resubmit"),
    ].join(""),
  );
  const text = [
    `Hi ${applicantName},`,
    ``,
    `We reviewed your seller application and can't approve it as-is. Here's what our team noted:`,
    ``,
    note,
    ``,
    `Update and resubmit it: ${onboardingUrl()}`,
    ``,
    `— The Ovyro team`,
  ].join("\n");
  return { subject, html, text };
}
