/**
 * Thin browser client for the seller listings API. Unwraps the `{ data }`
 * success envelope and turns the `{ error: { code, message } }` error envelope
 * into a thrown {@link ApiError} carrying the server's `code` — callers switch
 * on it (e.g. `PHOTOS_REQUIRED`) to show the right inline message.
 */
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

export const listingsApi = {
  create: <T>(payload: unknown) =>
    request<T>("/api/dashboard/listings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: <T>(id: string, payload: unknown) =>
    request<T>(`/api/dashboard/listings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  remove: <T>(id: string) =>
    request<T>(`/api/dashboard/listings/${id}`, { method: "DELETE" }),

  setStatus: <T>(id: string, to: string) =>
    request<T>(`/api/dashboard/listings/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ to }),
    }),
};
