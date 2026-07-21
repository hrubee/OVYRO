import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <PlaceholderPage
      title="Admin"
      description="Platform KPIs, the listing moderation queue, users, and leads. Access gating arrives with auth in a later phase."
    />
  );
}
