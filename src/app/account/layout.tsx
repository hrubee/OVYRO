import Link from "next/link";
import { requireAccountActor } from "./_lib/data";
import { AccountNav } from "./_components/account-nav";
import { SignOutButton } from "./_components/sign-out-button";

/**
 * Buyer-account shell (spec §4.2). Gating happens here once for every nested
 * page: an anonymous visitor is redirected to sign in before any account data
 * is queried. The chrome is self-composed (the root layout owns no header).
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireAccountActor();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Ovyro
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/land"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Browse land
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {actor.email}
          </p>
        </div>
        <AccountNav />
        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
}
