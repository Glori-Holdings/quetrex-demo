import type { Link, LinkFields } from "./types.ts";

export interface UpsertResult {
  merged: boolean;
  link: Link;
}

/**
 * Finds an existing link with the same normalized URL. If found, returns the
 * existing record with its tags unioned with the candidate's tags (0
 * duplicates, no new id allocated) and un-archived — re-adding a URL is an
 * explicit signal to re-surface it. Otherwise creates a new record via
 * `makeNew`.
 */
export function upsertLink(
  existing: Link[],
  candidate: LinkFields,
  makeNew: () => Link,
): UpsertResult {
  const match = existing.find((link) => link.url === candidate.url);
  if (!match) {
    return { merged: false, link: makeNew() };
  }

  const tags = [...match.tags];
  for (const tag of candidate.tags) {
    if (!tags.includes(tag)) tags.push(tag);
  }

  return { merged: true, link: { ...match, tags, archived: false } };
}
