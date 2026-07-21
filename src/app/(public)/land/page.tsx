import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Browse land" };

export default function BrowseLandPage() {
  return (
    <PlaceholderPage
      title="Browse land"
      description="Search and filter land parcels. Listing search, filters, and the map view land in a later phase."
    />
  );
}
