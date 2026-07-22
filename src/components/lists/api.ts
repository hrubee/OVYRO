/**
 * Thin browser client for the buyer-account lists API (`/api/me/lists`).
 * Unwraps the `{ data }` success envelope and turns `{ error: { code, message } }`
 * into a thrown {@link ApiError} carrying the server's `code` — mirrors the
 * seller dashboard client so both surfaces handle errors the same way.
 */
import type { ListDTO, SavedItemDTO } from "@/lib/lists";

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

export interface ListsForListing {
  lists: ListDTO[];
  savedListIds: string[];
}

const seg = (value: string) => encodeURIComponent(value);

export const listsApi = {
  /** All lists plus which of them already hold `listingId` (drives the save UI). */
  forListing: (listingId: string) =>
    request<ListsForListing>(`/api/me/lists?listingId=${seg(listingId)}`),

  list: () => request<{ lists: ListDTO[] }>("/api/me/lists"),

  create: (name: string) =>
    request<ListDTO>("/api/me/lists", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  rename: (id: string, name: string) =>
    request<ListDTO>(`/api/me/lists/${seg(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  remove: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/api/me/lists/${seg(id)}`, {
      method: "DELETE",
    }),

  addItem: (listId: string, listingId: string) =>
    request<{ listId: string; listingId: string; priceAtSave: number | null }>(
      `/api/me/lists/${seg(listId)}/items/${seg(listingId)}`,
      { method: "PUT" },
    ),

  removeItem: (listId: string, listingId: string) =>
    request<{ listId: string; listingId: string; removed: boolean }>(
      `/api/me/lists/${seg(listId)}/items/${seg(listingId)}`,
      { method: "DELETE" },
    ),
};

export type { ListDTO, SavedItemDTO };
