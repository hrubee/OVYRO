import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ListingWizard } from "@/components/dashboard/listings/listing-wizard";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!isSeller(actor.roles)) redirect("/dashboard");

  return (
    <main className="w-full p-6">
      <ListingWizard mode="create" />
    </main>
  );
}
