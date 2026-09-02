"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createRandomIdGenerator, createSystemClock } from "@/lib/clock";
import { createStore, type ListOptions } from "@/lib/store";
import type { Link } from "@/lib/types";

const store = createStore({
  now: createSystemClock(),
  nextId: createRandomIdGenerator(),
});

function readTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** Reads the current link list through the store seam for rendering. */
export async function getLinks(options: ListOptions = {}): Promise<Link[]> {
  return store.list(options);
}

/** Server Action backing the add-link form; validates before any write. */
export async function addLink(formData: FormData): Promise<void> {
  const url = String(formData.get("url") ?? "");
  const title = String(formData.get("title") ?? "");
  const note = String(formData.get("note") ?? "");
  const tags = readTags(String(formData.get("tags") ?? ""));

  const result = await store.add({ url, title, note, tags });

  if (!result.ok) {
    const params = new URLSearchParams({ error: result.message, title });
    redirect(`/?${params.toString()}`);
  }

  revalidatePath("/");
  redirect("/");
}

/** Server Action that archives a link and returns to the archived view. */
export async function archiveLink(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await store.archive(id);
  revalidatePath("/");
  redirect("/?archived=1");
}

/** Server Action that restores an archived link to the active view. */
export async function restoreLink(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await store.restore(id);
  revalidatePath("/");
  redirect("/");
}
