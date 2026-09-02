import { normalizeUrl } from "./url.ts";
import type { AddLinkInput, LinkFields, Result } from "./types.ts";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 120;
const MAX_NOTE_LENGTH = 1000;
export const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

export type ValidationResult = Result<LinkFields>;

/** Server-side validation of every submitted field — the client is never trusted. */
export function validateLinkInput(input: AddLinkInput): ValidationResult {
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    return { ok: false, message: "Enter a valid URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, message: "Enter a valid URL." };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, message: "Only http and https links are allowed." };
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length === 0) {
    return { ok: false, message: "Title is required." };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return {
      ok: false,
      message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
    };
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      message: `Note must be ${MAX_NOTE_LENGTH} characters or fewer.`,
    };
  }

  const rawTags = Array.isArray(input.tags) ? input.tags : [];
  if (rawTags.length > MAX_TAGS) {
    return { ok: false, message: `You can add at most ${MAX_TAGS} tags.` };
  }

  const tags: string[] = [];
  for (const tag of rawTags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TAG_LENGTH) continue;
    if (!tags.includes(trimmed)) tags.push(trimmed);
  }

  return {
    ok: true,
    value: { url: normalizeUrl(rawUrl), title, note, tags },
  };
}
