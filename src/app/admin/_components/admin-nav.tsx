"use client";

/**
 * Section tab bar for the `/admin` surface; highlights the current section.
 * Mirrors the seller `DashboardNav` so the admin console feels like the same
 * product.
 *
 * The `TABS` list is intentionally one-entry-per-line and additive: sibling
 * admin builders append their sections (Users, Leads, Settings) below the
 * marked line without reworking the array, so parallel edits merge cleanly.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface AdminTab {
  href: string;
  label: string;
  /** Match the href exactly (for the index route). */
  exact?: boolean;
}

const TABS: AdminTab[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/listings", label: "Moderation" },
  { href: "/admin/onboarding", label: "Applications" },
  // admin-ops: append Users / Leads / Settings sections below this line.
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Admin sections">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
