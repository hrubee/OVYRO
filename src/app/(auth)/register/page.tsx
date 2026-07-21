import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <PlaceholderPage
      title="Create an account"
      description="Sign-up starts every user as a buyer. Seller capability is added later via the seller onboarding flow."
    />
  );
}
