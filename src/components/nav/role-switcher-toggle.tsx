"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Buyer experience (spec §4.2) lives under /account; the seller area under /dashboard. */
const BROWSING_HREF = "/account";
const SELLING_HREF = "/dashboard";

/**
 * Segmented "Browsing / Selling" switch (spec §3.1, §4.3). The active side is
 * derived from the current path — anything under /dashboard is "Selling", every
 * other surface (buyer pages, public listing pages) is "Browsing" — so the same
 * control reads correctly wherever a shared header mounts it.
 *
 * Navigation is plain `<Link>`, so switching works without client JS;
 * `usePathname` only drives which side is highlighted. This component assumes it
 * is only ever rendered for a seller (its server wrapper {@link RoleSwitcher}
 * enforces that), making "seller is a superset of buyer" a single toggle rather
 * than two separate accounts.
 */
export function RoleSwitcherToggle() {
  const pathname = usePathname();
  const selling =
    pathname === SELLING_HREF || pathname.startsWith(`${SELLING_HREF}/`);

  return (
    <div
      role="group"
      aria-label="Switch between browsing and selling"
      className="inline-flex items-center rounded-md border bg-muted/40 p-0.5 text-sm"
    >
      <SwitchLink href={BROWSING_HREF} active={!selling}>
        Browsing
      </SwitchLink>
      <SwitchLink href={SELLING_HREF} active={selling}>
        Selling
      </SwitchLink>
    </div>
  );
}

function SwitchLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-[5px] px-3 py-1 font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
