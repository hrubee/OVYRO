"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { trackLead } from "@/components/meta/fbq";
import { contentParams } from "@/components/meta/pixel-logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The listing an inquiry targets — only the public fields the form needs. */
export interface InquiryFormListing {
  /** Listing id — the Meta `content_ids` for the Lead conversion. */
  id: string;
  /** Public slug — the inquiry POSTs to `/api/listings/[slug]/leads`. */
  slug: string;
  negotiable: boolean;
  /** Asking price + currency — the Meta Lead `value`/`currency`. */
  price: number;
  currency: string;
  /** Pre-formatted asking price (e.g. "₹12,00,000"), for the offer placeholder. */
  listedPriceText: string;
}

/** Profile-derived prefill (spec §4.2.2: name & phone pre-filled). */
export interface InquiryFormPrefill {
  name: string;
  phone: string;
  email: string;
}

export interface InquiryFormProps {
  listing: InquiryFormListing;
  prefill: InquiryFormPrefill;
  /** Turnstile site key, or `null` when CAPTCHA is not configured (dev/test). */
  turnstileSiteKey: string | null;
}

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

const PREFERRED_CONTACT_OPTIONS = [
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
] as const;

/**
 * Inquiry / negotiation form (spec §4.2.2). Rendered only for an authenticated,
 * phone-verified, non-owner buyer (the server panel gates that). Submits to
 * `POST /api/listings/[slug]/leads`; offer is optional (blank = ask at listed
 * price), consent is mandatory, and a hidden honeypot + Turnstile widget back
 * the server-side anti-abuse checks.
 */
export function InquiryForm({ listing, prefill, turnstileSiteKey }: InquiryFormProps) {
  const [contactName, setContactName] = useState(prefill.name);
  const [contactPhone, setContactPhone] = useState(prefill.phone);
  const [contactEmail, setContactEmail] = useState(prefill.email);
  const [offerAmount, setOfferAmount] = useState("");
  const [message, setMessage] = useState("");
  const [preferredContact, setPreferredContact] = useState<string>("phone");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState(""); // must stay empty — bots fill it
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Funnel step `inquiry_started` (spec §10): the form is now shown to a
  // qualified buyer (the server panel already gated auth + phone verification).
  // Fire-and-forget via the analytics beacon so it never delays or blocks the
  // form, and swallow everything — analytics must never break the inquiry flow.
  useEffect(() => {
    const body = JSON.stringify({
      event: "inquiry_started",
      listingId: listing.id,
    });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/analytics/beacon",
          new Blob([body], { type: "application/json" }),
        );
      } else {
        void fetch("/api/analytics/beacon", {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
          keepalive: true,
        });
      }
    } catch {
      // ignore — a missed analytics beacon must not affect the buyer.
    }
  }, [listing.id]);

  function resetCaptcha() {
    const turnstile = (window as unknown as { turnstile?: { reset?: () => void } })
      .turnstile;
    turnstile?.reset?.();
  }

  function readCaptchaToken(): string {
    const input = document.querySelector<HTMLInputElement>(
      'input[name="cf-turnstile-response"]',
    );
    return input?.value ?? "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!consent) {
      setError("Please tick the consent box so we can share your details.");
      return;
    }

    const body: Record<string, unknown> = {
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      preferredContact,
      consent,
      website: honeypot,
      captchaToken: turnstileSiteKey ? readCaptchaToken() : "",
    };

    const email = contactEmail.trim();
    if (email) body.contactEmail = email;

    const offer = offerAmount.trim();
    if (offer) {
      const amount = Number(offer);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Enter a valid offer amount, or leave it blank.");
        return;
      }
      body.offerAmount = amount;
    }

    const text = message.trim();
    if (text) body.message = text;

    setPending(true);
    let response: Response;
    try {
      response = await fetch(`/api/listings/${listing.slug}/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setPending(false);
      resetCaptcha();
      setError("Network error — please try again.");
      return;
    }
    setPending(false);

    if (response.ok) {
      // Fire the Meta Lead conversion (spec §5.3). No-ops unless the owner's
      // pixel is active and the visitor accepted cookies. `metaEventId` is the
      // server-minted de-dup key when the lead API surfaces it; otherwise Meta
      // assigns its own id.
      const data = (await response.json().catch(() => null)) as {
        lead?: { metaEventId?: string };
      } | null;
      const eventId =
        typeof data?.lead?.metaEventId === "string"
          ? data.lead.metaEventId
          : undefined;
      trackLead(
        contentParams({
          listingId: listing.id,
          value: listing.price,
          currency: listing.currency,
        }),
        eventId,
      );
      setDone(true);
      return;
    }

    resetCaptcha();
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setError(
      data?.error?.message ?? "Could not send your inquiry. Please try again.",
    );
  }

  if (done) {
    return (
      <section
        data-slot="inquiry-form"
        aria-label="Inquiry sent"
        className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
      >
        <h2 className="text-lg font-semibold">Inquiry sent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The seller has been notified and can reply to you directly. We&apos;ve
          also emailed you a confirmation — you can track this from your account.
        </p>
      </section>
    );
  }

  return (
    <section
      data-slot="inquiry-form"
      aria-label="Contact seller"
      className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
    >
      {turnstileSiteKey && (
        <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" async defer />
      )}
      <h2 className="text-lg font-semibold">
        Contact seller{listing.negotiable ? " or make an offer" : ""}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your details are shared only with this landowner.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="inquiry-name">Name</Label>
          <Input
            id="inquiry-name"
            name="contactName"
            autoComplete="name"
            required
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="inquiry-phone">Phone</Label>
          <Input
            id="inquiry-phone"
            name="contactPhone"
            type="tel"
            autoComplete="tel"
            required
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="inquiry-email">Email (optional)</Label>
          <Input
            id="inquiry-email"
            name="contactEmail"
            type="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </div>

        {listing.negotiable && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="inquiry-offer">Your offer (optional)</Label>
            <Input
              id="inquiry-offer"
              name="offerAmount"
              inputMode="decimal"
              placeholder={`Ask at listed price (${listing.listedPriceText})`}
              value={offerAmount}
              onChange={(event) => setOfferAmount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to ask at the listed price.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="inquiry-message">Message (optional)</Label>
          <textarea
            id="inquiry-message"
            name="message"
            rows={3}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="inquiry-preferred">Preferred contact</Label>
          <select
            id="inquiry-preferred"
            name="preferredContact"
            value={preferredContact}
            onChange={(event) => setPreferredContact(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {PREFERRED_CONTACT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Honeypot — visually hidden; a filled value flags a bot server-side. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="inquiry-website">Website</label>
          <input
            id="inquiry-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            I agree to share my contact details with the seller and to Ovyro&apos;s
            privacy policy.
          </span>
        </label>

        {turnstileSiteKey && (
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={pending || !consent} className="w-full">
          {pending ? "Sending…" : "Send inquiry"}
        </Button>
      </form>
    </section>
  );
}
