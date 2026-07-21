import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <PlaceholderPage
      title="Your account"
      description="Saved lists, inquiry history, and profile settings. Access gating arrives with auth in a later phase."
    />
  );
}
