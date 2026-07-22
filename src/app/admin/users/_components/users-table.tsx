"use client";

/**
 * Client table for admin user management (spec §4.1.2).
 *
 * Filtering navigates via the URL (`?q=&role=&status=`) so the server component
 * re-runs the query and the result is shareable/back-button friendly. Row
 * actions POST/DELETE to `/api/admin/users/...`, then refresh the server
 * component so the row reflects its new state.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Role } from "@/lib/auth/roles";
import type { AdminUserRow } from "@/app/api/admin/users/_lib/types";

interface Filters {
  q: string;
  role: string;
  status: string;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All roles" },
  { value: "buyer", label: "Buyers" },
  { value: "seller", label: "Sellers" },
  { value: "admin", label: "Admins" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

export function UsersTable({
  users,
  filters,
  currentUserId,
}: {
  users: AdminUserRow[];
  filters: Filters;
  currentUserId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);

  function navigate(next: Partial<Filters>) {
    const merged = { q, role: filters.role, status: filters.status, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.role) params.set("role", merged.role);
    if (merged.status) params.set("status", merged.status);
    const query = params.toString();
    router.push(query ? `/admin/users?${query}` : "/admin/users");
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q });
        }}
      >
        <Input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search name or email…"
          className="max-w-xs"
          aria-label="Search users"
        />
        <select
          value={filters.role}
          onChange={(event) => navigate({ role: event.target.value })}
          aria-label="Filter by role"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(event) => navigate({ status: event.target.value })}
          aria-label="Filter by status"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
      </form>

      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No users match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Inquiries</th>
                <th className="px-4 py-3 font-medium">Listings</th>
                <th className="px-4 py-3 font-medium">Meta</th>
                <th className="px-4 py-3 font-medium">Last active</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUserId}
                  onChanged={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const META_LABELS: Record<AdminUserRow["metaConnection"], string> = {
  none: "—",
  active: "Connected",
  needs_reauth: "Needs re-auth",
  disconnected: "Disconnected",
};

function StatusBadge({ status }: { status: AdminUserRow["status"] }) {
  const tone =
    status === "active"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "suspended"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  return <span className={`font-medium capitalize ${tone}`}>{status}</span>;
}

type ActionKey = "suspend" | "unsuspend" | "grant" | "revoke" | "delete";

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<ActionKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDeleted = user.status === "deleted";
  const isSeller = user.roles.includes("seller" as Role);

  async function run(action: ActionKey, request: () => Promise<Response>) {
    setError(null);
    setPending(action);
    try {
      const response = await request();
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? "The action could not be completed.");
      }
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be completed.");
    } finally {
      setPending(null);
    }
  }

  const post = (path: string, body?: unknown) => () =>
    fetch(`/api/admin/users/${user.id}${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

  function confirmDelete() {
    if (
      window.confirm(
        `Permanently anonymize ${user.name} (${user.email})? Their personal data will be scrubbed. This cannot be undone.`,
      )
    ) {
      void run("delete", () =>
        fetch(`/api/admin/users/${user.id}`, { method: "DELETE" }),
      );
    }
  }

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-medium">{user.name}</div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            user.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border px-2 py-0.5 text-xs capitalize"
              >
                {role}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={user.status} />
        {isSelf && <div className="text-xs text-muted-foreground">You</div>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">{formatDate(user.signupAt)}</td>
      <td className="px-4 py-3 tabular-nums">{user.inquiriesMade}</td>
      <td className="px-4 py-3 tabular-nums">{user.listingsCount}</td>
      <td className="px-4 py-3 whitespace-nowrap text-xs">
        {META_LABELS[user.metaConnection]}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {formatDate(user.lastActiveAt)}
      </td>
      <td className="px-4 py-3">
        {isDeleted ? (
          <span className="block text-right text-xs text-muted-foreground">
            Anonymized
          </span>
        ) : (
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              {user.status === "suspended" ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => run("unsuspend", post("/unsuspend"))}
                >
                  {pending === "unsuspend" ? "…" : "Unsuspend"}
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pending !== null || isSelf}
                  title={isSelf ? "You cannot suspend your own account." : undefined}
                  onClick={() => run("suspend", post("/suspend"))}
                >
                  {pending === "suspend" ? "…" : "Suspend"}
                </Button>
              )}

              {isSeller ? (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={pending !== null}
                  onClick={() => run("revoke", post("/role", { action: "revoke" }))}
                >
                  {pending === "revoke" ? "…" : "Revoke seller"}
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={pending !== null}
                  onClick={() => run("grant", post("/role", { action: "grant" }))}
                >
                  {pending === "grant" ? "…" : "Grant seller"}
                </Button>
              )}

              <Button
                size="xs"
                variant="destructive"
                disabled={pending !== null || isSelf}
                title={isSelf ? "You cannot delete your own account." : undefined}
                onClick={confirmDelete}
              >
                {pending === "delete" ? "…" : "Delete"}
              </Button>
            </div>
            {error && (
              <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
