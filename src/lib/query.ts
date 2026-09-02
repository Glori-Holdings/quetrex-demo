import type { Link } from "./types.ts";

export interface FilterOptions {
  tag?: string;
  q?: string;
  archived?: boolean;
}

/**
 * Filters links by archived state (defaults to active-only), exact tag
 * match, and a case-insensitive plain substring match against title OR
 * note. `q` is never compiled into a RegExp (ReDoS boundary).
 */
export function filterLinks(
  links: Link[],
  options: FilterOptions = {},
): Link[] {
  const archived = options.archived ?? false;
  const q = options.q?.trim().toLowerCase() ?? "";

  return links.filter((link) => {
    if (link.archived !== archived) return false;
    if (options.tag && !link.tags.includes(options.tag)) return false;
    if (
      q &&
      !link.title.toLowerCase().includes(q) &&
      !link.note.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export type SortMode = "newest" | "title";

/** Default: newest-first by createdAt. 'title': case-insensitive ascending. Unknown values fall back to default. */
export function sortLinks(links: Link[], sort?: string): Link[] {
  const mode: SortMode = sort === "title" ? "title" : "newest";
  const sorted = [...links];

  if (mode === "title") {
    sorted.sort((a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
    );
  } else {
    sorted.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  }

  return sorted;
}
