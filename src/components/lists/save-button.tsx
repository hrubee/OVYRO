"use client";

import { Check, Heart, Loader2, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { ApiError, listsApi, type ListDTO } from "./api";

/**
 * Save-to-list control (spec §4.2.3). Gated on "is signed in", never a role
 * check (spec §3.1): a signed-in user opens a popover to save the listing into
 * any of their lists (the auto-created wishlist or a custom one); an anonymous
 * visitor is bounced to the signup wall. The heart is filled whenever the
 * listing is in at least one list.
 *
 * `variant="overlay"` renders a compact circular button for browse cards;
 * `variant="inline"` renders a labelled button for the listing landing page.
 */
export function SaveButton({
  listingId,
  variant = "inline",
  className,
}: {
  listingId: string;
  variant?: "inline" | "overlay";
  className?: string;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListDTO[] | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const signedIn = Boolean(session?.user);
  const isSaved = saved.size > 0;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function loadLists() {
    setLoading(true);
    setError(null);
    try {
      const data = await listsApi.forListing(listingId);
      setLists(data.lists);
      setSaved(new Set(data.savedListIds));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load your lists.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleTrigger(event: React.MouseEvent) {
    // The browse card wraps its body in a link; keep a save click from navigating.
    event.preventDefault();
    event.stopPropagation();
    if (isPending) return;
    if (!signedIn) {
      router.push(`/register?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const next = !open;
    setOpen(next);
    if (next && lists === null) void loadLists();
  }

  async function toggleList(list: ListDTO) {
    if (busyId) return;
    const wasSaved = saved.has(list.id);
    setBusyId(list.id);
    setError(null);
    setSaved((prev) => {
      const copy = new Set(prev);
      if (wasSaved) copy.delete(list.id);
      else copy.add(list.id);
      return copy;
    });
    try {
      if (wasSaved) await listsApi.removeItem(list.id, listingId);
      else await listsApi.addItem(list.id, listingId);
    } catch (err) {
      setSaved((prev) => {
        const copy = new Set(prev);
        if (wasSaved) copy.add(list.id);
        else copy.delete(list.id);
        return copy;
      });
      setError(
        err instanceof ApiError ? err.message : "Could not update the list.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const list = await listsApi.create(name);
      await listsApi.addItem(list.id, listingId);
      setLists((prev) => (prev ? [...prev, { ...list, itemCount: 1 }] : [list]));
      setSaved((prev) => new Set(prev).add(list.id));
      setNewName("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the list.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {variant === "overlay" ? (
        <button
          type="button"
          onClick={handleTrigger}
          aria-label={isSaved ? "Edit saved lists" : "Save listing"}
          aria-pressed={isSaved}
          className="flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Heart className={cn("size-4", isSaved && "fill-primary text-primary")} />
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTrigger}
          aria-pressed={isSaved}
        >
          <Heart className={cn("size-4", isSaved && "fill-primary text-primary")} />
          {isSaved ? "Saved" : "Save"}
        </Button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Save to a list"
          className="absolute right-0 z-30 mt-2 w-64 rounded-lg border bg-card p-2 text-card-foreground shadow-lg"
        >
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Save to
          </p>

          {loading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading your lists…
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {(lists ?? []).map((list) => {
                const active = saved.has(list.id);
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      onClick={() => toggleList(list)}
                      disabled={busyId === list.id}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
                    >
                      <span className="truncate">
                        {list.name}
                        {list.isDefault && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (default)
                          </span>
                        )}
                      </span>
                      {busyId === list.id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : (
                        active && <Check className="size-4 shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleCreate} className="mt-1 flex gap-1 border-t px-1 pt-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New list…"
              maxLength={60}
              aria-label="New list name"
              className="h-8"
            />
            <Button
              type="submit"
              size="icon-sm"
              variant="outline"
              disabled={creating || newName.trim().length === 0}
              aria-label="Create list and save"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          </form>

          {error && (
            <p role="alert" className="px-2 pt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
