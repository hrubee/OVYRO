"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { FormError } from "./auth-shell";

const emailSchema = z.email("Enter a valid email address.");

type Mode = "password" | "otp-request" | "otp-verify";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Only same-origin paths are honoured, so a crafted `?next=` cannot bounce a
   * freshly authenticated user to another site.
   */
  const nextParam = searchParams.get("next");
  const redirectTo = nextParam?.startsWith("/") ? nextParam : "/account";

  function onDone() {
    router.push(redirectTo);
    router.refresh();
  }

  async function handlePasswordSignIn(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const { error: signInError } = await authClient.signIn.email({
      email: parsed.data,
      password,
    });
    setPending(false);

    if (signInError) {
      setError(signInError.message ?? "Could not sign you in.");
      return;
    }
    onDone();
  }

  async function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email: parsed.data,
      type: "sign-in",
    });
    setPending(false);

    if (otpError) {
      setError(otpError.message ?? "Could not send a code.");
      return;
    }
    setMode("otp-verify");
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: verifyError } = await authClient.signIn.emailOtp({
      email,
      otp,
    });
    setPending(false);

    if (verifyError) {
      setError(verifyError.message ?? "That code did not work.");
      return;
    }
    onDone();
  }

  if (mode === "otp-verify") {
    return (
      <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="otp">Six-digit code</Label>
          <Input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">Sent to {email}.</p>
        </div>
        <FormError message={error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Verifying…" : "Verify and sign in"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setMode("password");
            setOtp("");
            setError(null);
          }}
        >
          Use a password instead
        </Button>
      </form>
    );
  }

  const sendingCode = mode === "otp-request";

  return (
    <form
      onSubmit={sendingCode ? handleSendCode : handlePasswordSignIn}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {!sendingCode && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      )}

      <FormError message={error} />

      <Button type="submit" disabled={pending}>
        {pending
          ? sendingCode
            ? "Sending…"
            : "Signing in…"
          : sendingCode
            ? "Email me a code"
            : "Sign in"}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setMode(sendingCode ? "password" : "otp-request");
          setError(null);
        }}
      >
        {sendingCode ? "Sign in with a password" : "Email me a code instead"}
      </Button>
    </form>
  );
}
