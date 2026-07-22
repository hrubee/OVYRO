/**
 * Admin settings (spec §4.1.6) — `/admin/settings`.
 *
 * Server component: gated to admins, renders the feature-flag toggles (incl. the
 * moderation auto-approve toggles) via the client `FlagsPanel`, plus a read-only
 * admin-management stub. Admin is assigned manually (seed script), never
 * self-serve (spec §3.1) — so this surface lists admins but does not grant the
 * role. Anonymous visitors are bounced to login; non-admins get a 404.
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { listAdmins, listFlags } from "@/app/api/admin/settings/_lib/queries";
import { FlagsPanel } from "./_components/flags-panel";

export const metadata: Metadata = { title: "Settings · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin/settings");
  if (!isAdmin(actor.roles)) notFound();

  const [flags, admins] = await Promise.all([listFlags(), listAdmins()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform feature flags and moderation toggles.
        </p>
      </header>

      <FlagsPanel flags={flags} />

      <section className="mt-12">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Administrators
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Admin access is granted manually via the seed script, never from the
          app (spec §3.1). This list is read-only.
        </p>
        <ul className="divide-y rounded-lg border">
          {admins.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No administrators found.
            </li>
          ) : (
            admins.map((admin) => (
              <li
                key={admin.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <div className="font-medium">{admin.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {admin.email}
                  </div>
                </div>
                {admin.id === actor.userId && (
                  <span className="text-xs text-muted-foreground">You</span>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
