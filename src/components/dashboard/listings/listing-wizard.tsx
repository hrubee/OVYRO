"use client";

/**
 * Multi-step create/edit wizard (spec §4.3.1): basics → location → details →
 * media → review. One component drives both flows:
 *
 *   - create: collects the parcel, POSTs a *draft*, then routes to the edit
 *     screen — photos attach to a listing id, and media upload is the media
 *     builder's surface, so we hand off there rather than block here.
 *   - edit: prefilled from the listing; PATCHes changes, and offers "Submit for
 *     review" when the status allows it. The photo requirement is enforced by
 *     the server (`PHOTOS_REQUIRED`); we mirror it in the UI from the listing's
 *     own media (read-only) so the button is disabled before the round-trip.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { areaUnit, landType } from "@/lib/db/schema";
import type { AreaUnit, LandType, ListingDTO } from "@/lib/listings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiError, listingsApi } from "./api-client";
import { sellerActionsFor } from "./actions";
import { MapPinPicker } from "./map-pin-picker";

const LAND_TYPE_LABELS: Record<LandType, string> = {
  agricultural: "Agricultural",
  residential_plot: "Residential plot",
  commercial: "Commercial",
  industrial: "Industrial",
  recreational: "Recreational",
  other: "Other",
};

const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqft: "sq ft",
  sqm: "sq m",
  acre: "acre",
  hectare: "hectare",
  guntha: "guntha",
  cent: "cent",
  other: "other",
};

interface FormState {
  title: string;
  landType: LandType;
  price: string;
  negotiable: boolean;
  currency: string;
  addressText: string;
  city: string;
  region: string;
  country: string;
  lat: number | null;
  lng: number | null;
  surveyNumber: string;
  area: string;
  areaUnit: AreaUnit;
  roadAccess: boolean;
  water: boolean;
  electricity: boolean;
  zoning: string;
  legalDocsAvailable: boolean;
  description: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  landType: "agricultural",
  price: "",
  negotiable: false,
  currency: "INR",
  addressText: "",
  city: "",
  region: "",
  country: "",
  lat: null,
  lng: null,
  surveyNumber: "",
  area: "",
  areaUnit: "acre",
  roadAccess: false,
  water: false,
  electricity: false,
  zoning: "",
  legalDocsAvailable: false,
  description: "",
};

function dtoToForm(listing: ListingDTO): FormState {
  return {
    title: listing.title,
    landType: listing.landType,
    price: String(listing.price),
    negotiable: listing.negotiable,
    currency: listing.currency,
    addressText: listing.addressText,
    city: listing.city ?? "",
    region: listing.region ?? "",
    country: listing.country ?? "",
    lat: listing.lat,
    lng: listing.lng,
    surveyNumber: listing.surveyNumber ?? "",
    area: String(listing.area),
    areaUnit: listing.areaUnit,
    roadAccess: listing.roadAccess ?? false,
    water: listing.water ?? false,
    electricity: listing.electricity ?? false,
    zoning: listing.zoning ?? "",
    legalDocsAvailable: listing.legalDocsAvailable,
    description: listing.description,
  };
}

/** Build the API payload from the form — trims, coerces, drops empty optionals. */
function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    landType: form.landType,
    price: Number(form.price),
    negotiable: form.negotiable,
    currency: form.currency.trim().toUpperCase(),
    area: Number(form.area),
    areaUnit: form.areaUnit,
    roadAccess: form.roadAccess,
    water: form.water,
    electricity: form.electricity,
    legalDocsAvailable: form.legalDocsAvailable,
    description: form.description.trim(),
    addressText: form.addressText.trim(),
  };
  if (form.city.trim()) payload.city = form.city.trim();
  if (form.region.trim()) payload.region = form.region.trim();
  if (form.country.trim()) payload.country = form.country.trim().toUpperCase();
  if (form.lat !== null) payload.lat = form.lat;
  if (form.lng !== null) payload.lng = form.lng;
  if (form.surveyNumber.trim()) payload.surveyNumber = form.surveyNumber.trim();
  if (form.zoning.trim()) payload.zoning = form.zoning.trim();
  return payload;
}

function validate(form: FormState): string | null {
  if (form.title.trim().length < 3) return "Title must be at least 3 characters.";
  if (!(Number(form.price) > 0)) return "Enter a price greater than zero.";
  if (!(Number(form.area) > 0)) return "Enter a land area greater than zero.";
  if (form.currency.trim().length !== 3)
    return "Use a 3-letter currency code (e.g. INR).";
  return null;
}

const STEPS = ["Basics", "Location", "Details", "Media", "Review"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
const textareaClass =
  "min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-input"
      />
      {label}
    </label>
  );
}

export type ListingWizardProps =
  | { mode: "create"; listing?: undefined }
  | { mode: "edit"; listing: ListingDTO };

export function ListingWizard({ mode, listing }: ListingWizardProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    listing ? dtoToForm(listing) : EMPTY_FORM,
  );
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const photoCount = useMemo(
    () => listing?.media.filter((m) => m.kind === "photo").length ?? 0,
    [listing],
  );
  const submitAction = listing
    ? sellerActionsFor(listing.status).find((a) => a.to === "pending_review")
    : undefined;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const payload = toPayload(form);
      if (mode === "create") {
        const created = await listingsApi.create<ListingDTO>(payload);
        router.push(`/dashboard/listings/${created.id}/edit`);
        router.refresh();
        return;
      }
      await listingsApi.update<ListingDTO>(listing.id, payload);
      setNotice("Changes saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the listing.");
    } finally {
      setPending(false);
    }
  }

  async function handleSubmitForReview() {
    if (!listing) return;
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await listingsApi.setStatus<ListingDTO>(listing.id, "pending_review");
      router.push("/dashboard/listings");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not submit for review.",
      );
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "create" ? "New listing" : "Edit listing"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </header>

      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={cn(
                "rounded-full px-3 py-1",
                index === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-4 rounded-xl border p-6">
        {step === 0 ? (
          <>
            <Field label="Title" htmlFor="title">
              <Input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. 3-acre agricultural plot near Nashik"
              />
            </Field>
            <Field label="Land type" htmlFor="landType">
              <select
                id="landType"
                className={selectClass}
                value={form.landType}
                onChange={(e) => update("landType", e.target.value as LandType)}
              >
                {landType.enumValues.map((value) => (
                  <option key={value} value={value}>
                    {LAND_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Price" htmlFor="price">
                <Input
                  id="price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                  placeholder="2500000"
                />
              </Field>
              <Field label="Currency" htmlFor="currency">
                <Input
                  id="currency"
                  value={form.currency}
                  onChange={(e) => update("currency", e.target.value)}
                  maxLength={3}
                />
              </Field>
            </div>
            <CheckboxField
              label="Price is negotiable"
              checked={form.negotiable}
              onChange={(value) => update("negotiable", value)}
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field label="Address" htmlFor="addressText">
              <Input
                id="addressText"
                value={form.addressText}
                onChange={(e) => update("addressText", e.target.value)}
                placeholder="Village, taluka, district"
              />
            </Field>
            <Field
              label="Map location"
              hint="Click the map or enter coordinates to place the parcel."
            >
              <MapPinPicker
                lat={form.lat}
                lng={form.lng}
                onChange={({ lat, lng }) => setForm((p) => ({ ...p, lat, lng }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City" htmlFor="city">
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                />
              </Field>
              <Field label="Region / state" htmlFor="region">
                <Input
                  id="region"
                  value={form.region}
                  onChange={(e) => update("region", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Country" htmlFor="country" hint="2-letter code, e.g. IN">
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) => update("country", e.target.value)}
                  maxLength={2}
                />
              </Field>
              <Field label="Plot / survey number" htmlFor="surveyNumber">
                <Input
                  id="surveyNumber"
                  value={form.surveyNumber}
                  onChange={(e) => update("surveyNumber", e.target.value)}
                />
              </Field>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Area" htmlFor="area">
                <Input
                  id="area"
                  inputMode="decimal"
                  value={form.area}
                  onChange={(e) => update("area", e.target.value)}
                  placeholder="3"
                />
              </Field>
              <Field label="Area unit" htmlFor="areaUnit">
                <select
                  id="areaUnit"
                  className={selectClass}
                  value={form.areaUnit}
                  onChange={(e) => update("areaUnit", e.target.value as AreaUnit)}
                >
                  {areaUnit.enumValues.map((value) => (
                    <option key={value} value={value}>
                      {AREA_UNIT_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <CheckboxField
                label="Road access"
                checked={form.roadAccess}
                onChange={(value) => update("roadAccess", value)}
              />
              <CheckboxField
                label="Water connection"
                checked={form.water}
                onChange={(value) => update("water", value)}
              />
              <CheckboxField
                label="Electricity"
                checked={form.electricity}
                onChange={(value) => update("electricity", value)}
              />
              <CheckboxField
                label="Legal documents available"
                checked={form.legalDocsAvailable}
                onChange={(value) => update("legalDocsAvailable", value)}
              />
            </div>
            <Field label="Zoning" htmlFor="zoning">
              <Input
                id="zoning"
                value={form.zoning}
                onChange={(e) => update("zoning", e.target.value)}
                placeholder="e.g. green zone"
              />
            </Field>
            <Field label="Description" htmlFor="description">
              <textarea
                id="description"
                className={textareaClass}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Frontage, soil, nearby landmarks, connectivity…"
              />
            </Field>
          </>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-3">
            {mode === "create" ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Photos and videos are added after the draft is saved. Finish on the
                Review step, then upload media from the edit screen.
              </div>
            ) : (
              <div
                data-slot="listing-media-mount"
                data-listing-id={listing.id}
                className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
              >
                {photoCount > 0
                  ? `${photoCount} photo${photoCount === 1 ? "" : "s"} attached.`
                  : "No photos yet."}{" "}
                The photo &amp; video uploader mounts here.
              </div>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Title</dt>
              <dd className="truncate">{form.title || "—"}</dd>
              <dt className="text-muted-foreground">Land type</dt>
              <dd>{LAND_TYPE_LABELS[form.landType]}</dd>
              <dt className="text-muted-foreground">Price</dt>
              <dd>
                {form.currency} {form.price || "—"}
                {form.negotiable ? " (negotiable)" : ""}
              </dd>
              <dt className="text-muted-foreground">Area</dt>
              <dd>
                {form.area || "—"} {AREA_UNIT_LABELS[form.areaUnit]}
              </dd>
              <dt className="text-muted-foreground">Location</dt>
              <dd className="truncate">{form.addressText || form.city || "—"}</dd>
            </dl>

            {mode === "edit" && submitAction ? (
              <div className="rounded-lg border p-4 text-sm">
                {photoCount < 1 ? (
                  <p className="text-muted-foreground">
                    Add at least one photo before submitting for review.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Ready to submit — an admin will review before it goes live.
                  </p>
                )}
                <Button
                  className="mt-3"
                  disabled={pending || photoCount < 1}
                  onClick={handleSubmitForReview}
                >
                  {submitAction.label}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 0 || pending}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
            Next
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "create"
                ? "Save draft"
                : "Save changes"}
          </Button>
        )}
      </div>
    </div>
  );
}
