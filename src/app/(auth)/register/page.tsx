import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../_components/auth-shell";
import { RegisterForm } from "../_components/register-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create an account"
      description="Every account starts as a buyer. Listing land is added later through seller onboarding."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
