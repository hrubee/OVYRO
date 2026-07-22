/**
 * POST /api/listings/[slug]/leads — create an inquiry / negotiation lead (spec §7, §4.2.2).
 *
 * The full anti-abuse + eligibility pipeline, in order:
 *   1. authentication — buyer experience is "is authenticated", never a role check,
 *   2. rate limits (per listing+buyer / user / IP) — shields the DB first (§12),
 *   3. body validation — leads-core `.strict()` schema; honeypot stripped + checked,
 *   4. listing must be active + non-deleted,
 *   5. self-inquiry rejected (a seller can't inquire on their own listing),
 *   6. caller phone must be verified (else the UI shows the OTP wall),
 *   7. CAPTCHA verified last, so its network call only fires for valid inquiries,
 *   8. lead row created (+ `lead_count` bump) and two emails enqueued.
 *
 * Every error flows through `jsonError` into the spec §7 envelope.
 */
import { NextResponse } from "next/server";
import { trackInquirySubmitted } from "@/lib/analytics";
import { requireActor } from "@/lib/auth/session";
import { verifyCaptcha } from "@/lib/captcha";
import { listingUrl } from "@/lib/email/templates";
import { formatPrice } from "@/lib/search";
import { assertNotSelfInquiry, assertPhoneVerified } from "./_lib/guards";
import { CaptchaError, NotFoundError, jsonError } from "./_lib/http";
import { getClientIp, getClientUa } from "./_lib/ip";
import { enforceInquiryRateLimits } from "./_lib/rate-limit";
import {
  createLead,
  dispatchInquiryEmails,
  loadActiveListing,
  loadInquirerContact,
  loadSellerContact,
  preferredContactLabel,
  serialize,
} from "./_lib/service";
import { parseSubmission } from "./_lib/submission";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const actor = await requireActor(); // 401 when anonymous
    const { slug } = await params;

    const ip = getClientIp(request.headers);
    const ua = getClientUa(request.headers);

    // Anti-abuse gate first, to shield the DB from spam bursts (spec §12).
    await enforceInquiryRateLimits({ ip, userId: actor.userId, listingId: slug });

    const raw = await request.json().catch(() => null);
    const { inquiry, captchaToken } = parseSubmission(raw);

    const listing = await loadActiveListing(slug);
    if (!listing) throw new NotFoundError();

    assertNotSelfInquiry(actor.userId, listing.sellerId);

    const inquirer = await loadInquirerContact(actor.userId);
    if (!inquirer) throw new NotFoundError("Account not found.");
    assertPhoneVerified(inquirer.phoneVerifiedAt);

    // CAPTCHA last: its network round-trip only runs for otherwise-valid inquiries.
    const captcha = await verifyCaptcha(captchaToken, {
      remoteIp: ip ?? undefined,
    });
    if (!captcha.success) throw new CaptchaError();

    const lead = await createLead({
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerId: actor.userId,
      inquiry,
      clientIp: ip,
      clientUa: ua,
    });

    // Funnel conversion event (spec §10) — best-effort; `track` swallows its own
    // write errors so a committed lead can never be turned into a 500.
    await trackInquirySubmitted({
      listingId: listing.id,
      sellerId: listing.sellerId,
      userId: actor.userId,
    });

    const offerText =
      inquiry.offerAmount != null
        ? formatPrice(inquiry.offerAmount, listing.currency)
        : null;
    const seller = await loadSellerContact(listing.sellerId);
    await dispatchInquiryEmails({
      sellerName: seller?.name ?? "there",
      sellerEmail: seller?.email ?? "",
      buyerName: inquiry.contactName,
      buyerAccountEmail: actor.email,
      contactPhone: inquiry.contactPhone,
      contactEmail: inquiry.contactEmail ?? null,
      preferredContactLabel: preferredContactLabel(inquiry.preferredContact),
      offerText,
      message: inquiry.message ?? null,
      listingTitle: listing.title,
      listingUrl: listingUrl(listing.slug),
    });

    return NextResponse.json({ lead: serialize(lead) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
