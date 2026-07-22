import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Minimal public chrome shared by the home, browse, and listing pages. The
 * root layout is owned elsewhere, so the public surfaces compose this header
 * themselves. Sign-in points at the existing auth route.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Ovyro
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/land" className="px-2 py-1 text-muted-foreground hover:text-foreground">
            Browse land
          </Link>
          <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
