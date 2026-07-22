import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { trackListingView } from "@/lib/analytics";
import { db } from "@/lib/db";
import {
  formatArea,
  formatLocation,
  formatPrice,
  getPublicListingDetail,
  incrementListingView,
  landTypeLabel,
  listingUrl,
  type PublicListingDetail,
} from "@/lib/search";
import { PixelMount } from "@/components/meta/pixel-mount";
import { ListingGallery } from "./_components/gallery";
import { InquiryMountPoint, SaveMountPoint } from "./_components/mount-points";

/**
 * The landing page counts each view (`view_count`, spec §4.2.1), which requires
 * per-request execution — so it renders dynamically rather than statically. It
 * is still server-rendered and SEO-friendly (correct OG/Twitter/canonical tags
 * below); the R-8 edge-cache/ISR optimization would layer on top later once the
 * counter is moved to a fire-and-forget beacon.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** Deduped per request: `generateMetadata` and the page share one DB read. */
const loadListing = cache((slug: string) => getPublicListingDetail(db, slug));

function metaDescription(listing: PublicListingDetail): string {
  const body = listing.description.trim();
  if (body.length > 0) {
    return body.length > 160 ? `${body.slice(0, 157).trimEnd()}…` : body;
  }
  const location = formatLocation(listing);
  const where = location ? ` in ${location}` : "";
  const price = formatPrice(listing.price, listing.currency);
  return `${formatArea(listing.area, listing.areaUnit)} of ${landTypeLabel(
    listing.landType,
  ).toLowerCase()}${where} — ${price}${listing.negotiable ? ", negotiable" : ""}.`;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await loadListing(slug);
  if (!listing) {
    return { title: "Listing not found", robots: { index: false } };
  }

  const canonical = listingUrl(listing.slug);
  const description = metaDescription(listing);
  const images = listing.coverImageUrl ? [listing.coverImageUrl] : undefined;

  return {
    title: listing.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: listing.title,
      description,
      url: canonical,
      siteName: "Ovyro",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: listing.title,
      description,
      images,
    },
  };
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export default async function ListingDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const listing = await loadListing(slug);
  if (!listing) notFound();

  // Best-effort view count — a counter failure must never break the page.
  try {
    await incrementListingView(db, listing.id);
  } catch {
    // swallow: the listing still renders without the increment.
  }

  // Funnel `listing_view` event (spec §10), written server-side with basic bot
  // filtering off the request UA. `trackListingView` swallows its own write
  // errors and drops obvious crawlers, so this can never break the page.
  const requestHeaders = await headers();
  await trackListingView({
    listingId: listing.id,
    sellerId: listing.sellerId,
    userAgent: requestHeaders.get("user-agent"),
  });

  const location = formatLocation(listing);

  return (
    <>
      {/* The one place a seller's pixel may fire — only the owner's, only after
          consent (spec §5.2, R-4). No-ops when the owner has no pixel. */}
      <PixelMount
        listing={{
          id: listing.id,
          sellerId: listing.sellerId,
          price: listing.price,
          currency: listing.currency,
        }}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <nav className="mb-4 text-sm">
          <Link href="/land" className="text-muted-foreground hover:text-foreground">
            ← Back to browse
          </Link>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <ListingGallery media={listing.media} title={listing.title} />

            <header className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {listing.title}
                </h1>
                {location && (
                  <p className="mt-1 text-muted-foreground">{location}</p>
                )}
              </div>
              <SaveMountPoint listingId={listing.id} />
            </header>

            <section aria-label="Description">
              <h2 className="mb-2 text-lg font-semibold">About this land</h2>
              <p className="whitespace-pre-line text-muted-foreground">
                {listing.description.trim() || "No description provided."}
              </p>
            </section>

            <section aria-label="Parcel details">
              <h2 className="mb-2 text-lg font-semibold">Parcel details</h2>
              <dl className="text-sm">
                <DetailRow label="Land type" value={landTypeLabel(listing.landType)} />
                <DetailRow
                  label="Area"
                  value={formatArea(listing.area, listing.areaUnit)}
                />
                {listing.zoning && <DetailRow label="Zoning" value={listing.zoning} />}
                {listing.surveyNumber && (
                  <DetailRow label="Survey number" value={listing.surveyNumber} />
                )}
                {listing.roadAccess !== null && (
                  <DetailRow label="Road access" value={yesNo(listing.roadAccess)} />
                )}
                {listing.water !== null && (
                  <DetailRow label="Water supply" value={yesNo(listing.water)} />
                )}
                {listing.electricity !== null && (
                  <DetailRow label="Electricity" value={yesNo(listing.electricity)} />
                )}
                <DetailRow
                  label="Legal documents"
                  value={listing.legalDocsAvailable ? "Available" : "Not specified"}
                />
                {listing.lat !== null && listing.lng !== null && (
                  <DetailRow
                    label="Coordinates"
                    value={`${listing.lat}, ${listing.lng}`}
                  />
                )}
              </dl>
            </section>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
              <div className="text-3xl font-semibold tracking-tight">
                {formatPrice(listing.price, listing.currency)}
              </div>
              {listing.negotiable && (
                <span className="text-sm text-muted-foreground">Negotiable</span>
              )}
              <p className="mt-3 text-sm">
                {formatArea(listing.area, listing.areaUnit)} ·{" "}
                {landTypeLabel(listing.landType)}
              </p>
              <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                Listed by{" "}
                <span className="font-medium text-foreground">
                  {listing.seller.displayName}
                </span>
              </p>
            </div>

            <InquiryMountPoint listing={listing} />
          </aside>
        </div>
      </main>
    </>
  );
}
