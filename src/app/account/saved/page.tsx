import type { Metadata } from "next";
import { db } from "@/lib/db";
import { listSavedItems, listUserLists, type SavedItemDTO } from "@/lib/lists";
import { requireAccountActor } from "../_lib/data";
import { SavedLists } from "./_components/saved-lists";

export const metadata: Metadata = { title: "Saved listings" };

/** Saved state is per-user and changes often — never serve a static snapshot. */
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const actor = await requireAccountActor();

  const [lists, items] = await Promise.all([
    listUserLists(db, actor.userId),
    listSavedItems(db, actor.userId),
  ]);

  const itemsByList: Record<string, SavedItemDTO[]> = {};
  for (const item of items) {
    (itemsByList[item.listId] ??= []).push(item);
  }

  return <SavedLists initialLists={lists} initialItems={itemsByList} />;
}
