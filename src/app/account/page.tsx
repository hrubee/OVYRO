import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { listUserLists } from "@/lib/lists";
import { listBuyerInquiries } from "@/app/api/me/inquiries/_lib/repo";
import { requireAccountActor } from "./_lib/data";

export const metadata: Metadata = { title: "Your account" };

/** Account rows always reflect live saved/inquiry state — never a static cache. */
export const dynamic = "force-dynamic";

function SummaryCard({
  href,
  label,
  count,
  hint,
}: {
  href: string;
  label: string;
  count: number;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="text-3xl font-semibold tracking-tight">{count}</span>
      <span className="font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
    </Link>
  );
}

export default async function AccountOverviewPage() {
  const actor = await requireAccountActor();

  const [lists, inquiries] = await Promise.all([
    listUserLists(db, actor.userId),
    listBuyerInquiries(db, actor.userId),
  ]);
  const savedCount = lists.reduce((sum, list) => sum + list.itemCount, 0);

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          href="/account/saved"
          label="Saved listings"
          count={savedCount}
          hint={`Across ${lists.length} ${lists.length === 1 ? "list" : "lists"}`}
        />
        <SummaryCard
          href="/account/inquiries"
          label="Inquiries sent"
          count={inquiries.length}
          hint="Offers and messages to sellers"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Browse <Link href="/land" className="underline underline-offset-4">available land</Link>{" "}
        to save parcels and send inquiries.
      </p>
    </section>
  );
}
