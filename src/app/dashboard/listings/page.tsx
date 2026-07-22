import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listCoverPhotos,
  listSellerListings,
} from "@/app/api/dashboard/listings/_lib/repo";
import { ListingsTable } from "@/components/dashboard/listings/listings-table";
import { Button } from "@/components/ui/button";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeSummary } from "@/lib/listings";

export const metadata: Metadata = { title: "Your listings" };

export default async function ListingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!isSeller(actor.roles)) redirect("/dashboard");

  const rows = await listSellerListings(db, actor.userId);
  const covers = await listCoverPhotos(
    db,
    rows.map((row) => row.id),
  );
  const listings = rows.map((row) =>
    serializeSummary(row, covers.get(row.id) ?? null),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your listings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your parcels, submit them for review, and track their status.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/listings/new">New listing</Link>
        </Button>
      </div>

      <ListingsTable initialListings={listings} />
    </main>
  );
}
