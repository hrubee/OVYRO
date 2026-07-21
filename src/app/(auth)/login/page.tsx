import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "../_components/auth-shell";
import { LoginForm } from "../_components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      description="Sign in with your password, or have a one-time code emailed to you."
      footer={
        <>
          New to Ovyro?{" "}
          <Link href="/register" className="underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {/* LoginForm reads `?next=`, so it needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
