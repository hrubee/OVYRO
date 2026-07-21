import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <PlaceholderPage
      title="Log in"
      description="Email/password, email OTP, and Google sign-in are wired up with Better Auth in a later phase."
    />
  );
}
