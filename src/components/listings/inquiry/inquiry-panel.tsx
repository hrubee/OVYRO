import Link from "next/link";
import { eq } from "drizzle-orm";
import { buttonVariants } from "@/components/ui/button";
import { getActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatPrice } from "@/lib/search";
import { cn } from "@/lib/utils";
import { InquiryForm } from "./inquiry-form";

/** The listing fields the inquiry flow needs (public-safe subset). */
export interface InquiryPanelListing {
  id: string;
  slug: string;
  sellerId: string;
  negotiable: boolean;
  price: number;
  currency: string;
}

/** Turnstile public site key, or `null` when CAPTCHA is not configured. */
function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return key && key.trim() !== "" ? key : null;
}

/** Shared card wrapper for the pre-form walls (matches the listing aside cards). */
function Wall({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-slot="inquiry-form"
      aria-label="Contact seller"
      className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Server gate for the inquiry form (spec §3.1, §4.2.2). Decides — from the
 * session and the caller's verification state — whether to show the form or a
 * low-friction wall:
 *   - anonymous → sign-in wall (form state is re-reachable after login),
 *   - the listing's own seller → "this is your listing" (no self-inquiry),
 *   - phone not verified → verify-phone wall,
 *   - otherwise → the form, prefilled from the profile.
 *
 * Reads run server-side so no buyer PII or verification state ships to anon users.
 */
export async function InquiryPanel({ listing }: { listing: InquiryPanelListing }) {
  const actor = await getActor();

  if (!actor) {
    const next = encodeURIComponent(`/land/${listing.slug}`);
    return (
      <Wall title="Contact seller">
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to send an inquiry{listing.negotiable ? " or make an offer" : ""}.
          It only takes a moment.
        </p>
        <Link
          href={`/login?next=${next}`}
          className={cn(buttonVariants(), "mt-4 w-full")}
        >
          Sign in to continue
        </Link>
      </Wall>
    );
  }

  if (actor.userId === listing.sellerId) {
    return (
      <Wall title="This is your listing">
        <p className="mt-1 text-sm text-muted-foreground">
          You can&apos;t send an inquiry on your own listing. Manage incoming leads
          from your dashboard.
        </p>
        <Link
          href="/dashboard/leads"
          className={cn(buttonVariants({ variant: "outline" }), "mt-4 w-full")}
        >
          View your leads
        </Link>
      </Wall>
    );
  }

  const [profile] = await db
    .select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);

  if (!profile?.phoneVerifiedAt) {
    return (
      <Wall title="Verify your phone">
        <p className="mt-1 text-sm text-muted-foreground">
          Sellers only accept inquiries from verified buyers. Add and verify your
          phone number to continue.
        </p>
        <Link
          href="/account"
          className={cn(buttonVariants(), "mt-4 w-full")}
        >
          Verify my phone
        </Link>
      </Wall>
    );
  }

  return (
    <InquiryForm
      listing={{
        id: listing.id,
        negotiable: listing.negotiable,
        listedPriceText: formatPrice(listing.price, listing.currency),
      }}
      prefill={{
        name: actor.name,
        phone: profile.phone ?? "",
        email: actor.email,
      }}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
