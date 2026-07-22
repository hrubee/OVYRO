/**
 * Buyer-facing "we've sent your inquiry" email (spec §4.2.2).
 *
 * Sent immediately after a buyer submits an inquiry: it confirms the message
 * reached the seller, recaps what was sent, and links to the buyer's inquiries
 * page. Pure `(data) -> RenderedEmail`, rendered by the route handler and handed
 * to the `email`/`send` job (matching the Phase 1 moderation-email pattern).
 */
import { appOrigin, type RenderedEmail } from "./listing-moderation";
import { emailButton, emailLayout, escapeHtml } from "./_shared";

/** Where a buyer tracks every listing they have inquired on (spec §4.2.3). */
export function buyerInquiriesUrl(): string {
  return `${appOrigin()}/account/inquiries`;
}

export interface InquiryConfirmationEmailData {
  buyerName: string;
  listingTitle: string;
  listingUrl: string;
  /** Pre-formatted price (e.g. "₹12,00,000"), or `null` when at asking price. */
  offerText: string | null;
  inquiriesUrl: string;
}

/** Sent to the buyer confirming their inquiry was delivered to the seller. */
export function inquiryConfirmationEmail(
  data: InquiryConfirmationEmailData,
): RenderedEmail {
  const { buyerName, listingTitle, listingUrl, offerText, inquiriesUrl } = data;

  const offerLine = offerText
    ? `<p>Your offer of <strong>${escapeHtml(offerText)}</strong> is on its way to the seller.</p>`
    : `<p>You asked to connect at the listed price.</p>`;
  const offerTextLine = offerText
    ? `Your offer: ${offerText}`
    : `You asked to connect at the listed price.`;

  const subject = `We've sent your inquiry about "${listingTitle}"`;

  const html = emailLayout(
    "Your inquiry is on its way",
    [
      `<p>Hi ${escapeHtml(buyerName)},</p>`,
      `<p>Thanks — we've passed your inquiry about <strong>${escapeHtml(
        listingTitle,
      )}</strong> to the seller. They can reply to you directly.</p>`,
      offerLine,
      emailButton(inquiriesUrl, "View your inquiries"),
      `<p style="font-size:13px;color:#64748b">You can track this and every listing you've contacted from your account. <a href="${listingUrl}" style="color:#64748b">Revisit the listing</a>.</p>`,
    ].join(""),
  );

  const text = [
    `Hi ${buyerName},`,
    ``,
    `Thanks — we've passed your inquiry about "${listingTitle}" to the seller. They can reply to you directly.`,
    ``,
    offerTextLine,
    ``,
    `View your inquiries: ${inquiriesUrl}`,
    `Revisit the listing: ${listingUrl}`,
    ``,
    `— The Ovyro team`,
  ].join("\n");

  return { subject, html, text };
}
