/**
 * Admin console shell (spec §4.1). Gates the whole `/admin` surface once: an
 * anonymous visitor is bounced to sign in; an authenticated non-admin gets a
 * 404 so the admin console stays invisible (spec §4.1 — admin is assigned
 * manually and never advertised). Each nested page still re-checks, so the gate
 * holds even if this layout is ever bypassed.
 *
 * Renders the shared header + section nav (which this builder owns); sibling
 * admin builders add their sections to {@link ./_components/admin-nav}.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SignOutButton } from "@/app/account/_components/sign-out-button";
import { isAdmin } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { AdminNav } from "./_components/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin");
  if (!isAdmin(actor.roles)) notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-2">
            <Link href="/admin" className="text-lg font-semibold tracking-tight">
              Ovyro
            </Link>
            <span className="text-sm text-muted-foreground">Admin</span>
          </div>
          <SignOutButton />
        </div>
        <div className="mx-auto max-w-6xl border-t px-6">
          <AdminNav />
        </div>
      </header>

      {children}
    </div>
  );
}
