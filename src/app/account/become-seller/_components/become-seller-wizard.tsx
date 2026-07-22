"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { sellerType } from "@/lib/db/schema";
import {
  onboardingSubmitSchema,
  type OnboardingSubmitInput,
  type SellerType,
} from "@/lib/onboarding";
import type { BuyerOnboardingDTO } from "@/app/api/me/seller-onboarding/_lib/dto";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Copy for each seller type, keyed by the enum so it can never drift. */
const SELLER_TYPE_META: Record<SellerType, { label: string; hint: string }> = {
  individual: { label: "Individual owner", hint: "You own the land yourself." },
  broker: { label: "Broker / agent", hint: "You list land for other owners." },
  company: { label: "Company", hint: "A registered business owns the land." },
};

const STEP_LABELS = ["Type", "Details", "Agreement", "Review"] as const;

interface AddressForm {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

const EMPTY_ADDRESS: AddressForm = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

type Phase = "form" | "submitted" | "approved" | "rejected";

function phaseFor(dto: BuyerOnboardingDTO | null): Phase {
  switch (dto?.state) {
    case "submitted":
      return "submitted";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      return "form";
  }
}

function seedAddress(dto: BuyerOnboardingDTO | null): AddressForm {
  const a = dto?.address;
  if (!a) return EMPTY_ADDRESS;
  return {
    line1: a.line1 ?? "",
    line2: a.line2 ?? "",
    city: a.city ?? "",
    region: a.region ?? "",
    postalCode: a.postalCode ?? "",
    country: a.country ?? "",
  };
}

/** Drop the empty optional address sub-fields before sending them up. */
function toAddressPayload(a: AddressForm) {
  return {
    line1: a.line1.trim(),
    ...(a.line2.trim() ? { line2: a.line2.trim() } : {}),
    city: a.city.trim(),
    ...(a.region.trim() ? { region: a.region.trim() } : {}),
    ...(a.postalCode.trim() ? { postalCode: a.postalCode.trim() } : {}),
    country: a.country.trim().toUpperCase(),
  };
}

async function postOnboarding(
  path: string,
  body: unknown,
): Promise<BuyerOnboardingDTO> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: BuyerOnboardingDTO; error?: { message?: string } }
    | null;
  if (!res.ok) {
    throw new Error(
      json?.error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return json!.data as BuyerOnboardingDTO;
}

/**
 * Buyer → seller onboarding wizard (spec §4.2.4). Resumable: each step persists
 * through `POST /api/me/seller-onboarding` (which keeps the row `in_progress`),
 * and the final review submits the complete application. The row is *not* the
 * seller role — admin approval grants that — so submitting lands the applicant
 * in a "pending review" state, and a rejected application can be edited and
 * resubmitted (the first save reopens it).
 */
export function BecomeSellerWizard({
  initial,
}: {
  initial: BuyerOnboardingDTO | null;
}) {
  const [dto, setDto] = useState<BuyerOnboardingDTO | null>(initial);
  const [phase, setPhase] = useState<Phase>(() => phaseFor(initial));

  const [step, setStep] = useState(0);
  const [sellerTypeValue, setSellerTypeValue] = useState<SellerType | "">(
    initial?.sellerType ?? "",
  );
  const [legalName, setLegalName] = useState(initial?.legalName ?? "");
  const [address, setAddress] = useState<AddressForm>(() => seedAddress(initial));
  const [idDocumentUrl, setIdDocumentUrl] = useState(initial?.idDocumentUrl ?? "");
  const [termsAccepted, setTermsAccepted] = useState(
    initial?.termsAccepted ?? false,
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setAddressField(key: keyof AddressForm, value: string) {
    setAddress((prev) => ({ ...prev, [key]: value }));
  }

  /** Client-side gate for the current step; returns an error message or null. */
  function validateStep(): string | null {
    if (step === 0 && !sellerTypeValue) {
      return "Choose the type of seller you are.";
    }
    if (step === 1) {
      if (!legalName.trim()) return "Enter the legal name for the account.";
      if (!address.line1.trim()) return "Enter the street address.";
      if (!address.city.trim()) return "Enter the city.";
      if (address.country.trim().length !== 2) {
        return "Enter a 2-letter country code (e.g. IN).";
      }
    }
    if (step === 2 && !termsAccepted) {
      return "You must accept the seller terms to continue.";
    }
    return null;
  }

  /** The fields to persist for the step being left. */
  function stepPayload(): Record<string, unknown> {
    if (step === 0) return { step: 1, sellerType: sellerTypeValue };
    if (step === 1) {
      return {
        step: 2,
        legalName: legalName.trim(),
        address: toAddressPayload(address),
        ...(idDocumentUrl.trim() ? { idDocumentUrl: idDocumentUrl.trim() } : {}),
      };
    }
    return { step: 3, termsAccepted };
  }

  async function handleContinue() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const saved = await postOnboarding("/api/me/seller-onboarding", stepPayload());
      setDto(saved);
      setStep((s) => s + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your progress.");
    } finally {
      setPending(false);
    }
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit() {
    setError(null);
    const raw = {
      sellerType: sellerTypeValue,
      legalName: legalName.trim(),
      address: toAddressPayload(address),
      ...(idDocumentUrl.trim() ? { idDocumentUrl: idDocumentUrl.trim() } : {}),
      termsAccepted,
    };
    const parsed = onboardingSubmitSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete every step.");
      return;
    }
    setPending(true);
    try {
      const saved = await postOnboarding(
        "/api/me/seller-onboarding/submit",
        parsed.data satisfies OnboardingSubmitInput,
      );
      setDto(saved);
      setPhase("submitted");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit your application.",
      );
    } finally {
      setPending(false);
    }
  }

  function handleEditResubmit() {
    setError(null);
    setStep(0);
    setPhase("form");
  }

  if (phase === "submitted") {
    return (
      <StatusCard
        icon={<Clock className="size-5 text-muted-foreground" />}
        title="Application submitted"
        description="We're reviewing your details. You'll get an email as soon as your seller account is approved."
      >
        {dto?.submittedAt && (
          <p className="text-sm text-muted-foreground">
            Submitted {new Date(dto.submittedAt).toLocaleDateString()}.
          </p>
        )}
      </StatusCard>
    );
  }

  if (phase === "approved") {
    return (
      <StatusCard
        icon={<CheckCircle2 className="size-5 text-primary" />}
        title="You're approved"
        description="Your seller account is ready. Create your first listing from the dashboard."
      >
        <Button asChild className="self-start">
          <Link href="/dashboard">Go to seller dashboard</Link>
        </Button>
      </StatusCard>
    );
  }

  if (phase === "rejected") {
    return (
      <StatusCard
        icon={<XCircle className="size-5 text-destructive" />}
        title="Your application needs changes"
        description="An admin reviewed your application and it wasn't approved yet."
      >
        {dto?.reviewNote && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">Reviewer note</p>
            <p className="text-muted-foreground">{dto.reviewNote}</p>
          </div>
        )}
        <Button onClick={handleEditResubmit} className="self-start">
          Edit &amp; resubmit
        </Button>
      </StatusCard>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Become a seller</CardTitle>
        <CardDescription>
          List land on Ovyro. Save as you go — you can finish this later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Stepper current={step} />

        {step === 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">
              What kind of seller are you?
            </legend>
            {sellerType.enumValues.map((value) => {
              const meta = SELLER_TYPE_META[value];
              const selected = sellerTypeValue === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "hover:border-foreground/30",
                  )}
                >
                  <input
                    type="radio"
                    name="sellerType"
                    value={value}
                    checked={selected}
                    onChange={() => setSellerTypeValue(value)}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="text-sm text-muted-foreground">
                      {meta.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="legalName">Legal name</Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full legal name or registered business name"
                autoComplete="name"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="line1">Street address</Label>
              <Input
                id="line1"
                value={address.line1}
                onChange={(e) => setAddressField("line1", e.target.value)}
                autoComplete="address-line1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="line2">
                Address line 2 <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="line2"
                value={address.line2}
                onChange={(e) => setAddressField("line2", e.target.value)}
                autoComplete="address-line2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={address.city}
                  onChange={(e) => setAddressField("city", e.target.value)}
                  autoComplete="address-level2"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="region">
                  State / region{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="region"
                  value={address.region}
                  onChange={(e) => setAddressField("region", e.target.value)}
                  autoComplete="address-level1"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="postalCode">
                  Postal code{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="postalCode"
                  value={address.postalCode}
                  onChange={(e) => setAddressField("postalCode", e.target.value)}
                  autoComplete="postal-code"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={address.country}
                  onChange={(e) =>
                    setAddressField("country", e.target.value.toUpperCase())
                  }
                  maxLength={2}
                  placeholder="IN"
                  autoComplete="country"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="idDocumentUrl">
                ID document link{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="idDocumentUrl"
                value={idDocumentUrl}
                onChange={(e) => setIdDocumentUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">
                A link to proof of identity or ownership. Uploads arrive later —
                a link is fine for now.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              By continuing you agree to Ovyro&apos;s seller terms: your listings are
              your responsibility, must be accurate, and Ovyro routes buyer
              inquiries to you as leads.
            </p>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">
                I have read and accept the Ovyro seller terms.
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <dl className="flex flex-col gap-3 text-sm">
            <ReviewRow label="Seller type">
              {sellerTypeValue ? SELLER_TYPE_META[sellerTypeValue].label : "—"}
            </ReviewRow>
            <ReviewRow label="Legal name">{legalName.trim() || "—"}</ReviewRow>
            <ReviewRow label="Address">
              {[
                address.line1,
                address.line2,
                address.city,
                address.region,
                address.postalCode,
                address.country,
              ]
                .map((p) => p.trim())
                .filter(Boolean)
                .join(", ") || "—"}
            </ReviewRow>
            <ReviewRow label="ID document">
              {idDocumentUrl.trim() || "Not provided"}
            </ReviewRow>
            <ReviewRow label="Terms">
              {termsAccepted ? "Accepted" : "Not accepted"}
            </ReviewRow>
          </dl>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={step === 0 || pending}
          >
            Back
          </Button>
          {step < STEP_LABELS.length - 1 ? (
            <Button type="button" onClick={handleContinue} disabled={pending}>
              {pending ? "Saving…" : "Continue"}
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={pending}>
              {pending ? "Submitting…" : "Submit application"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding steps">
      {STEP_LABELS.map((label, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                state === "upcoming"
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                state === "current" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ReviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-words">{children}</dd>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children && (
        <CardContent className="flex flex-col gap-3">{children}</CardContent>
      )}
    </Card>
  );
}
