"use client";

/**
 * Client table for the seller-application review queue. Each row approves or
 * rejects an application by POSTing to
 * `/api/admin/seller-onboarding/[id]/(approve|reject)`, then refreshes the
 * server component so the actioned application drops out of the pending list.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AdminOnboardingSubmission } from "@/app/api/admin/seller-onboarding/_lib/types";
import type { OnboardingAddress } from "@/lib/onboarding";

export function OnboardingReviewTable({
  submissions,
}: {
  submissions: AdminOnboardingSubmission[];
}) {
  if (submissions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        The queue is empty. New seller applications will appear here for review.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {submissions.map((submission) => (
        <ReviewRow key={submission.id} submission={submission} />
      ))}
    </ul>
  );
}

/** Human-readable seller type, e.g. `individual` -> `Individual`. */
function formatSellerType(value: string | null): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** One-line address from the structured `address_json`. */
function formatAddress(address: OnboardingAddress | null): string | null {
  if (!address) return null;
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
}

function ReviewRow({ submission }: { submission: AdminOnboardingSubmission }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "approved" | "rejected">(null);

  async function act(action: "approve" | "reject", body?: unknown) {
    setError(null);
    setPending(action);
    try {
      const response = await fetch(
        `/api/admin/seller-onboarding/${submission.id}/${action}`,
        {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error?.message ?? `Could not ${action} the application.`,
        );
      }
      setDone(action === "approve" ? "approved" : "rejected");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not ${action} the application.`,
      );
      setPending(null);
    }
  }

  const address = formatAddress(submission.address);

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate font-medium">
            {submission.legalName ?? submission.applicant.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatSellerType(submission.sellerType)}
            {address ? ` · ${address}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {submission.applicant.name} · {submission.applicant.email}
          </p>
          {submission.idDocumentUrl ? (
            <p className="mt-1 text-xs">
              <a
                href={submission.idDocumentUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                View ID document
              </a>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              No ID document provided.
            </p>
          )}
        </div>

        {done ? (
          <span className="text-sm font-medium text-muted-foreground">
            {done === "approved" ? "Approved ✓" : "Rejected"}
          </span>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              onClick={() => act("approve")}
              disabled={pending !== null}
            >
              {pending === "approve" ? "Approving…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejecting((open) => !open)}
              disabled={pending !== null}
            >
              Reject
            </Button>
          </div>
        )}
      </div>

      {rejecting && !done && (
        <div className="mt-4 flex flex-col gap-2">
          <label
            htmlFor={`note-${submission.id}`}
            className="text-sm font-medium"
          >
            Note (emailed to the applicant)
          </label>
          <textarea
            id={`note-${submission.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="Explain what needs to change before this can be approved."
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(false)}
              disabled={pending !== null}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => act("reject", { note })}
              disabled={pending !== null || note.trim().length === 0}
            >
              {pending === "reject" ? "Rejecting…" : "Confirm rejection"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </li>
  );
}
