import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getListingMedia,
  getSellerListing,
} from "@/app/api/dashboard/listings/_lib/repo";
import { ListingWizard } from "@/components/dashboard/listings/listing-wizard";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serialize } from "@/lib/listings";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!isSeller(actor.roles)) redirect("/dashboard");

  const { id } = await params;
  const row = await getSellerListing(db, actor.userId, id);
  if (!row) notFound();

  const media = await getListingMedia(db, row.id);
  const listing = serialize(row, media);

  return (
    <main className="w-full p-6">
      <ListingWizard mode="edit" listing={listing} />
    </main>
  );
}
