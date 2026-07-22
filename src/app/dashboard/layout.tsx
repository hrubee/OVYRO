import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/app/account/_components/sign-out-button";
import { RoleSwitcher } from "@/components/nav/role-switcher";
import { isSeller } from "@/lib/auth/roles";
import { getActor } from "@/lib/auth/session";
import { DashboardNav } from "./_components/dashboard-nav";

/**
 * Seller dashboard shell (spec §4.3). Gates once for every nested page: an
 * anonymous visitor is redirected to sign in before any dashboard data is read.
 *
 * It deliberately does NOT hard-gate on the `seller` role. The seller-only pages
 * (listings, leads, settings) each redirect a non-seller to the dashboard home
 * themselves, and the buyer → seller upgrade flow (spec §4.2.4) must stay
 * reachable by a not-yet-approved buyer. So the shell only enforces "is signed
 * in"; the section nav and the Selling toggle appear only once the seller role
 * is actually held.
 *
 * The header carries the global {@link RoleSwitcher}, so a seller can jump back
 * to their buyer /account experience at any time — the same additive-roles idea
 * (seller ⊇ buyer) expressed as one control instead of two accounts.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const seller = isSeller(actor.roles);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            Ovyro
          </Link>
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <SignOutButton />
          </div>
        </div>
        {seller && (
          <div className="mx-auto max-w-5xl border-t px-4">
            <DashboardNav />
          </div>
        )}
      </header>

      {children}
    </div>
  );
}
