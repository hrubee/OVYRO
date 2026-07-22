import type { Metadata } from "next";
import Link from "next/link";
import { CoverImage } from "@/app/(public)/_components/cover-image";
import {
  listBuyerInquiries,
  type BuyerInquiryDTO,
} from "@/app/api/me/inquiries/_lib/repo";
import { db } from "@/lib/db";
import type { LeadStatus } from "@/lib/leads";
import { formatPrice } from "@/lib/search/format";
import { cn } from "@/lib/utils";
import { requireAccountActor } from "../_lib/data";

export const metadata: Metadata = { title: "My inquiries" };

/** Lead status and listing state change over time — always render live. */
export const dynamic = "force-dynamic";

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Sent",
  contacted: "Seller contacted you",
  negotiating: "Negotiating",
  won: "Deal agreed",
  lost: "Closed",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

function InquiryRow({ inquiry }: { inquiry: BuyerInquiryDTO }) {
  const { lead, listing } = inquiry;
  const inactive = listing.removed || listing.status !== "active";

  return (
    <li
      className={cn(
        "flex gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm",
        inactive && "opacity-70",
      )}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-muted">
        <CoverImage
          src={listing.removed ? null : listing.coverImageUrl}
          alt={listing.title}
          sizes="80px"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          {listing.removed ? (
            <span className="font-medium">{listing.title}</span>
          ) : (
            <Link
              href={`/land/${listing.slug}`}
              className="font-medium hover:underline"
            >
              {listing.title}
            </Link>
          )}
          <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {LEAD_STATUS_LABEL[lead.status]}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          {lead.offerAmount !== null
            ? `Your offer: ${formatPrice(lead.offerAmount, listing.currency)}`
            : `Asking: ${formatPrice(listing.price, listing.currency)}`}
          {listing.removed
            ? " · No longer listed"
            : listing.status === "sold"
              ? " · Sold"
              : ""}
        </p>

        {lead.message && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            “{lead.message}”
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Sent {dateFmt.format(new Date(lead.createdAt))}
        </p>
      </div>
    </li>
  );
}

export default async function InquiriesPage() {
  const actor = await requireAccountActor();
  const inquiries = await listBuyerInquiries(db, actor.userId);

  if (inquiries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">No inquiries yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          When you contact a seller, your inquiries show up here.
        </p>
        <Link
          href="/land"
          className="mt-3 inline-block text-sm underline underline-offset-4"
        >
          Browse land
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {inquiries.map((inquiry) => (
        <InquiryRow key={inquiry.lead.id} inquiry={inquiry} />
      ))}
    </ul>
  );
}
