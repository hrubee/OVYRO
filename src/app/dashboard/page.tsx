import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Seller dashboard" };

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Seller dashboard"
      description="Listing management, the lead inbox, and Meta Ads connection. Access gating arrives with auth in a later phase."
    />
  );
}
