/**
 * Transactional email bodies for listing moderation (spec §4.1.3, §4.3.1).
 *
 * These render the seller-facing mail an admin's approve/reject action and the
 * expiry worker send. They are pure `(data) -> { subject, html, text }` — the
 * producer (an admin API route or the `listing-expiry` worker) renders one and
 * hands the result to the `email` queue's `send` job, so nothing here touches
 * Resend, the DB, or a request. That keeps them trivially unit-testable and
 * safe to import from the worker (no Next.js / React in the module graph).
 */

/** Fields the `email`/`send` job accepts. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Escape untrusted text (listing titles, rejection reasons) before HTML interpolation. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Public origin used in every link. Trailing slashes stripped so joins are clean. */
export function appOrigin(): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://ovyro.com";
  return origin.replace(/\/+$/, "");
}

/** Public, unauthenticated landing page for a listing (spec §4.2.1: `/land/[slug]`). */
export function listingUrl(slug: string): string {
  return `${appOrigin()}/land/${slug}`;
}

/** Where a seller manages (edits / resubmits / renews) their listings. */
export function sellerListingsUrl(): string {
  return `${appOrigin()}/dashboard/listings`;
}

/**
 * Shared, dependency-free HTML shell. Inline styles only — email clients strip
 * <style> and <head>, so every rule has to live on the element.
 */
function layout(heading: string, bodyHtml: string): string {
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6">`,
    `<h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${escapeHtml(heading)}</h1>`,
    bodyHtml,
    `<p style="font-size:13px;color:#64748b;margin-top:32px">— The Ovyro team</p>`,
    `</div>`,
  ].join("");
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:500">${escapeHtml(label)}</a></p>`;
}

export interface ApprovedEmailData {
  sellerName: string;
  listingTitle: string;
  listingUrl: string;
}

/** Sent when an admin approves a pending listing — it is now live and public. */
export function listingApprovedEmail(data: ApprovedEmailData): RenderedEmail {
  const { sellerName, listingTitle, listingUrl } = data;
  const subject = `Your listing "${listingTitle}" is live on Ovyro`;
  const html = layout(
    "Your listing is live",
    [
      `<p>Hi ${escapeHtml(sellerName)},</p>`,
      `<p>Good news — <strong>${escapeHtml(listingTitle)}</strong> passed review and is now published on Ovyro. Buyers can find it in search and open its landing page.</p>`,
      button(listingUrl, "View your live listing"),
      `<p style="font-size:13px;color:#64748b">It stays active for 90 days; we'll remind you before it expires so you can renew.</p>`,
    ].join(""),
  );
  const text = [
    `Hi ${sellerName},`,
    ``,
    `Good news — "${listingTitle}" passed review and is now live on Ovyro.`,
    ``,
    `View it: ${listingUrl}`,
    ``,
    `It stays active for 90 days; we'll remind you before it expires so you can renew.`,
    ``,
    `— The Ovyro team`,
  ].join("\n");
  return { subject, html, text };
}

export interface RejectedEmailData {
  sellerName: string;
  listingTitle: string;
  reason: string;
  editUrl: string;
}

/** Sent when an admin rejects a pending listing — includes the reason and how to fix it. */
export function listingRejectedEmail(data: RejectedEmailData): RenderedEmail {
  const { sellerName, listingTitle, reason, editUrl } = data;
  const subject = `Your listing "${listingTitle}" needs changes`;
  const html = layout(
    "Your listing needs changes",
    [
      `<p>Hi ${escapeHtml(sellerName)},</p>`,
      `<p>We reviewed <strong>${escapeHtml(listingTitle)}</strong> and can't publish it as-is. Here's why:</p>`,
      `<blockquote style="margin:16px 0;padding:12px 16px;background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:4px;white-space:pre-wrap">${escapeHtml(reason)}</blockquote>`,
      `<p>You can edit the listing and resubmit it for review.</p>`,
      button(editUrl, "Edit and resubmit"),
    ].join(""),
  );
  const text = [
    `Hi ${sellerName},`,
    ``,
    `We reviewed "${listingTitle}" and can't publish it as-is. Here's why:`,
    ``,
    reason,
    ``,
    `Edit and resubmit it: ${editUrl}`,
    ``,
    `— The Ovyro team`,
  ].join("\n");
  return { subject, html, text };
}

export interface ExpiredEmailData {
  sellerName: string;
  listingTitle: string;
  renewUrl: string;
}

/** Sent when the expiry worker retires an active listing after 90 idle days. */
export function listingExpiredEmail(data: ExpiredEmailData): RenderedEmail {
  const { sellerName, listingTitle, renewUrl } = data;
  const subject = `Your listing "${listingTitle}" has expired`;
  const html = layout(
    "Your listing has expired",
    [
      `<p>Hi ${escapeHtml(sellerName)},</p>`,
      `<p><strong>${escapeHtml(listingTitle)}</strong> has been active for 90 days and has now expired, so it no longer appears in search.</p>`,
      `<p>Still selling? Renew it to put it back in front of buyers — it goes through a quick review first.</p>`,
      button(renewUrl, "Renew your listing"),
    ].join(""),
  );
  const text = [
    `Hi ${sellerName},`,
    ``,
    `"${listingTitle}" has been active for 90 days and has now expired, so it no longer appears in search.`,
    ``,
    `Still selling? Renew it: ${renewUrl}`,
    ``,
    `— The Ovyro team`,
  ].join("\n");
  return { subject, html, text };
}
