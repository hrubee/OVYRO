"use client";

import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CoverImage } from "@/app/(public)/_components/cover-image";
import { ApiError, listsApi } from "@/components/lists/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ListDTO, SavedItemDTO } from "@/lib/lists";
import { formatPrice } from "@/lib/search/format";
import { cn } from "@/lib/utils";

type ItemsByList = Record<string, SavedItemDTO[]>;

/**
 * Client manager for the buyer's saved lists (spec §4.2.3): create/rename/delete
 * lists and remove saved listings, all against `/api/me/lists`. Seeded with the
 * server-rendered snapshot so the first paint is complete and interactive.
 */
export function SavedLists({
  initialLists,
  initialItems,
}: {
  initialLists: ListDTO[];
  initialItems: ItemsByList;
}) {
  const [lists, setLists] = useState<ListDTO[]>(initialLists);
  const [items, setItems] = useState<ItemsByList>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  function report(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const list = await listsApi.create(name);
      setLists((prev) => [...prev, list]);
      setItems((prev) => ({ ...prev, [list.id]: [] }));
      setNewName("");
    } catch (err) {
      report(err, "Could not create the list.");
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(list: ListDTO) {
    const name = editName.trim();
    if (!name) return;
    if (name === list.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await listsApi.rename(list.id, name);
      setLists((prev) =>
        prev.map((l) => (l.id === list.id ? { ...l, name: updated.name } : l)),
      );
      setEditingId(null);
    } catch (err) {
      report(err, "Could not rename the list.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(list: ListDTO) {
    if (
      !window.confirm(`Delete "${list.name}"? The saved listings in it are removed.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await listsApi.remove(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      setItems((prev) => {
        const next = { ...prev };
        delete next[list.id];
        return next;
      });
    } catch (err) {
      report(err, "Could not delete the list.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveItem(listId: string, item: SavedItemDTO) {
    setBusy(true);
    setError(null);
    try {
      await listsApi.removeItem(listId, item.listingId);
      setItems((prev) => ({
        ...prev,
        [listId]: (prev[listId] ?? []).filter((i) => i.id !== item.id),
      }));
    } catch (err) {
      report(err, "Could not remove that listing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <form onSubmit={handleCreate} className="flex max-w-sm gap-2">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Create a new list…"
          maxLength={60}
          aria-label="New list name"
        />
        <Button type="submit" disabled={creating || newName.trim().length === 0}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          New list
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {lists.map((list) => {
        const listItems = items[list.id] ?? [];
        return (
          <div key={list.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {editingId === list.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={60}
                    aria-label="List name"
                    className="h-8 w-48"
                  />
                  <Button size="sm" onClick={() => saveRename(list)} disabled={busy}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel rename"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold tracking-tight">{list.name}</h2>
                  {list.isDefault && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      Default
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {listItems.length} saved
                  </span>
                  {!list.isDefault && (
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Rename ${list.name}`}
                        onClick={() => {
                          setEditingId(list.id);
                          setEditName(list.name);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${list.name}`}
                        onClick={() => handleDelete(list)}
                        disabled={busy}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {listItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No saved listings yet.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {listItems.map((item) => (
                  <SavedItemCard
                    key={item.id}
                    item={item}
                    onRemove={() => handleRemoveItem(list.id, item)}
                    disabled={busy}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function SavedItemCard({
  item,
  onRemove,
  disabled,
}: {
  item: SavedItemDTO;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { listing } = item;
  const inactive = listing.removed || listing.status !== "active";
  const priceMoved =
    item.priceAtSave !== null && item.priceAtSave !== listing.price;

  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-sm",
        inactive && "opacity-60",
      )}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        <CoverImage
          src={listing.removed ? null : listing.coverImageUrl}
          alt={listing.title}
          sizes="64px"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {listing.removed ? (
          <span className="truncate font-medium">{listing.title}</span>
        ) : (
          <Link
            href={`/land/${listing.slug}`}
            className="truncate font-medium hover:underline"
          >
            {listing.title}
          </Link>
        )}
        <span className="text-sm font-semibold">
          {formatPrice(listing.price, listing.currency)}
        </span>
        {listing.removed ? (
          <span className="text-xs text-muted-foreground">No longer listed</span>
        ) : listing.status === "sold" ? (
          <span className="text-xs text-muted-foreground">Sold</span>
        ) : (
          priceMoved &&
          item.priceAtSave !== null && (
            <span className="text-xs text-muted-foreground">
              Saved at {formatPrice(item.priceAtSave, listing.currency)}
            </span>
          )
        )}
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${listing.title}`}
        onClick={onRemove}
        disabled={disabled}
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}
