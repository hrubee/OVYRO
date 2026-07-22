/**
 * Admin users management (spec §4.1.2) — `/admin/users`.
 *
 * Server component: gated to admins, resolves the search/filter query params,
 * fetches the users table server-side, and hands it to the client `UsersTable`
 * for the row actions (suspend/unsuspend, grant/revoke seller, soft-delete).
 * Anonymous visitors are bounced to login; authenticated non-admins get a 404 so
 * the admin surface stays hidden (spec §4.1).
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ROLES, isAdmin, type Role } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { listUsers } from "@/app/api/admin/users/_lib/queries";
import type { UserStatus } from "@/app/api/admin/users/_lib/types";
import { UsersTable } from "./_components/users-table";

export const metadata: Metadata = { title: "Users · Admin" };
export const dynamic = "force-dynamic";

const STATUSES: UserStatus[] = ["active", "suspended", "deleted"];

function parseRole(value: string | undefined): Role | undefined {
  return value && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : undefined;
}

function parseStatus(value: string | undefined): UserStatus | undefined {
  return value && (STATUSES as string[]).includes(value)
    ? (value as UserStatus)
    : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin/users");
  if (!isAdmin(actor.roles)) notFound();

  const { q, role, status } = await searchParams;
  const filters = {
    q: q?.trim() || undefined,
    role: parseRole(role),
    status: parseStatus(status),
  };

  const users = await listUsers(filters);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search and moderate accounts. Suspending a user blocks them from
          signing in; deleting anonymizes their personal data.
        </p>
      </header>

      <UsersTable
        users={users}
        filters={{ q: filters.q ?? "", role: filters.role ?? "", status: filters.status ?? "" }}
        currentUserId={actor.userId}
      />
    </main>
  );
}
