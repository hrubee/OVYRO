/**
 * Seller-facing "new inquiry" email (spec §4.2.2, §9).
 *
 * Sent immediately when a buyer submits an inquiry: it surfaces the offer,
 * message, and buyer contact details, and links the seller straight to their
 * lead inbox. Pure `(data) -> RenderedEmail` — the route handler renders it and
 * hands the result to the `email`/`send` job, so nothing here touches Resend,
 * the DB, or a request (matching the Phase 1 moderation-email pattern).
 */
import { appOrigin, type RenderedEmail } from "./listing-moderation";
import { emailButton, emailLayout, escapeHtml } from "./_shared";

/** Where a seller reviews and works their incoming leads (spec §4.3.2). */
export function sellerLeadsUrl(): string {
  return `${appOrigin()}/dashboard/leads`;
}

export interface LeadNotificationEmailData {
  sellerName: string;
  buyerName: string;
  listingTitle: string;
  listingUrl: string;
  /** Pre-formatted price (e.g. "₹12,00,000"), or `null` when at asking price. */
  offerText: string | null;
  message: string | null;
  /** Human label for the buyer's preferred channel ("Phone", "WhatsApp", "Email"). */
  preferredContact: string;
  buyerPhone: string;
  buyerEmail: string | null;
  leadsUrl: string;
}

function detailRow(label: string, value: string): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;white-space:nowrap">${escapeHtml(
    label,
  )}</td><td style="padding:6px 0;font-weight:500">${escapeHtml(value)}</td></tr>`;
}

/** Sent to the listing owner the moment a buyer submits an inquiry. */
export function leadNotificationEmail(data: LeadNotificationEmailData): RenderedEmail {
  const {
    sellerName,
    buyerName,
    listingTitle,
    listingUrl,
    offerText,
    message,
    preferredContact,
    buyerPhone,
    buyerEmail,
    leadsUrl,
  } = data;

  const offerLabel = offerText ?? "At asking price";
  const subject = `New inquiry on "${listingTitle}"`;

  const rows = [
    detailRow("Buyer", buyerName),
    detailRow("Offer", offerLabel),
    detailRow("Prefers", preferredContact),
    detailRow("Phone", buyerPhone),
    ...(buyerEmail ? [detailRow("Email", buyerEmail)] : []),
  ].join("");

  const messageBlock = message
    ? `<p style="margin:16px 0 4px;color:#64748b">Message</p><blockquote style="margin:0 0 16px;padding:12px 16px;background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:4px;white-space:pre-wrap">${escapeHtml(
        message,
      )}</blockquote>`
    : "";

  const html = emailLayout(
    "You have a new inquiry",
    [
      `<p>Hi ${escapeHtml(sellerName)},</p>`,
      `<p><strong>${escapeHtml(buyerName)}</strong> just inquired about <strong>${escapeHtml(
        listingTitle,
      )}</strong>.</p>`,
      `<table style="border-collapse:collapse;font-size:14px;margin:16px 0">${rows}</table>`,
      messageBlock,
      emailButton(leadsUrl, "Open your leads"),
      `<p style="font-size:13px;color:#64748b">Reply fast — buyers who hear back quickly are far more likely to close. <a href="${listingUrl}" style="color:#64748b">View the listing</a>.</p>`,
    ].join(""),
  );

  const text = [
    `Hi ${sellerName},`,
    ``,
    `${buyerName} just inquired about "${listingTitle}".`,
    ``,
    `Offer: ${offerLabel}`,
    `Prefers: ${preferredContact}`,
    `Phone: ${buyerPhone}`,
    ...(buyerEmail ? [`Email: ${buyerEmail}`] : []),
    ...(message ? [``, `Message:`, message] : []),
    ``,
    `Open your leads: ${leadsUrl}`,
    `View the listing: ${listingUrl}`,
    ``,
    `— The Ovyro team`,
  ].join("\n");

  return { subject, html, text };
}
