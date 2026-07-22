"use client";

/**
 * Reusable phone-verification widget (spec §4.2.2, §7).
 *
 * Two steps: enter a phone number → receive an SMS code (Twilio Verify, or the
 * fixed dev code in local DEV MODE) → enter the code. On success it fires
 * `onVerified` so the mounting surface (the inquiry/negotiation form, or the
 * buyer profile) can unlock. The server stamps `users.phone_verified_at`; this
 * component only drives the two `/api/auth/otp/*` endpoints and never sees the
 * code it isn't given.
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Step = "phone" | "code" | "verified";

export interface PhoneVerifyResult {
  phone: string;
  phoneVerifiedAt: string;
}

export interface PhoneVerifyProps {
  /** Pre-fill the phone field (e.g. from the buyer's saved number). */
  defaultPhone?: string;
  /** Called once the phone is verified server-side. */
  onVerified?: (result: PhoneVerifyResult) => void;
  className?: string;
}

/** Pull a human-readable message off an error response body. */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string;
      error?: string;
      issues?: Array<{ message: string }>;
    };
    return (
      body.issues?.[0]?.message ??
      body.message ??
      body.error ??
      `Request failed (${response.status}).`
    );
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export function PhoneVerify({
  defaultPhone = "",
  onVerified,
  className,
}: PhoneVerifyProps) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);

  const sendCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as { devMode?: boolean };
      setDevMode(body.devMode === true);
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const verifyCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as { phoneVerifiedAt: string };
      setStep("verified");
      onVerified?.({ phone, phoneVerifiedAt: body.phoneVerifiedAt });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [phone, code, onVerified]);

  if (step === "verified") {
    return (
      <div
        className={cn("rounded-md border border-input p-3 text-sm", className)}
        data-slot="phone-verify"
        data-verified="true"
      >
        <p className="font-medium text-foreground">Phone verified</p>
        <p className="text-muted-foreground">{phone}</p>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      data-slot="phone-verify"
    >
      {step === "phone" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <Label htmlFor="phone-verify-number">Phone number</Label>
          <Input
            id="phone-verify-number"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={error != null}
            disabled={busy}
            required
          />
          <Button type="submit" disabled={busy || phone.trim() === ""}>
            {busy ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
        >
          <Label htmlFor="phone-verify-code">Verification code</Label>
          <Input
            id="phone-verify-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={error != null}
            disabled={busy}
            required
          />
          {devMode ? (
            <p className="text-xs text-muted-foreground">
              Dev mode: no SMS was sent. Enter code{" "}
              <span className="font-mono font-medium">000000</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              We sent a code to {phone}.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.trim() === ""}>
              {busy ? "Verifying…" : "Verify"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
            >
              Change number
            </Button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
