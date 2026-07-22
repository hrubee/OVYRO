/**
 * Thin browser client for the seller lead inbox API. Unwraps the `{ data }`
 * success envelope and turns the `{ error: { code, message } }` error envelope
 * into a thrown {@link ApiError} carrying the server's `code`, so callers can
 * switch on it (e.g. `INVALID_TRANSITION`) to show the right inline message.
 * Mirrors the listings api-client so the two dashboard surfaces behave alike.
 */
import type { LeadDTO, LeadStatus } from "@/lib/leads";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("NETWORK", "Network error — please try again.", 0);
  }

  const body = (await res.json().catch(() => null)) as
    | { data?: unknown; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok) {
    throw new ApiError(
      body?.error?.code ?? "ERROR",
      body?.error?.message ?? "Request failed.",
      res.status,
    );
  }
  return body?.data as T;
}

/** Filters accepted by `GET /api/dashboard/leads`, as the UI holds them. */
export interface LeadQuery {
  listingId?: string;
  status?: LeadStatus | "";
  /** ISO-8601 lower/upper bounds on `created_at`. */
  from?: string;
  to?: string;
}

function toSearchParams(query: LeadQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const leadsApi = {
  list: (query: LeadQuery = {}) =>
    request<LeadDTO[]>(`/api/dashboard/leads${toSearchParams(query)}`),

  /** Opens a lead — the server stamps `sellerFirstViewedAt` on first read. */
  get: (id: string) => request<LeadDTO>(`/api/dashboard/leads/${id}`),

  setStatus: (id: string, status: LeadStatus) =>
    request<LeadDTO>(`/api/dashboard/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
