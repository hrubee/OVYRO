"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

const nameSchema = z.string().trim().min(1, "Tell us what to call you.");

/**
 * Buyer profile settings (spec §4.2). Name is editable via Better Auth. The
 * phone block is a mount point for the phone-OTP verify component owned by the
 * OTP builder; until that lands, phone shows read-only with a labelled slot so
 * the layout doesn't shift when verification is wired in.
 */
export function ProfileForm({
  initialName,
  email,
  phone,
  phoneVerified,
}: {
  initialName: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const dirty = name.trim() !== initialName.trim();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const { error: updateError } = await authClient.updateUser({
      name: parsed.data,
    });
    setPending(false);

    if (updateError) {
      setError(updateError.message ?? "Could not save your changes.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} readOnly disabled autoComplete="email" />
        <p className="text-sm text-muted-foreground">
          Your email is used to sign in and can’t be changed here.
        </p>
      </div>

      <div
        className="flex flex-col gap-2 rounded-lg border p-4"
        data-slot="phone-verify"
      >
        <Label>Phone number</Label>
        {phone ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">{phone}</span>
            {phoneVerified ? (
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                <CheckCircle2 className="size-3.5" /> Verified
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not verified</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No phone number on file.</p>
        )}
        {/* Phase 2: phone-OTP verify component (Twilio Verify) mounts here. */}
        <p className="text-xs text-muted-foreground">
          Phone verification is required to submit inquiries and arrives with the
          inquiry flow.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-sm text-primary">Saved.</p>
      )}

      <Button type="submit" disabled={pending || !dirty} className="self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
