import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { upsertLink } from "./dedupe.ts";
import { filterLinks, sortLinks, type FilterOptions } from "./query.ts";
import type { AddLinkInput, Link, Result } from "./types.ts";
import { validateLinkInput } from "./validate.ts";
import type { Clock, IdGenerator } from "./clock.ts";

const DEFAULT_STORE_PATH = path.join(process.cwd(), ".data", "links.json");

export interface StoreOptions {
  now: Clock;
  nextId: IdGenerator;
  filePath?: string;
}

export interface ListOptions extends FilterOptions {
  sort?: string;
}

export interface Store {
  add(input: AddLinkInput): Promise<Result<Link>>;
  list(options?: ListOptions): Promise<Link[]>;
  all(): Promise<Link[]>;
  archive(id: string): Promise<Result<Link>>;
  restore(id: string): Promise<Result<Link>>;
}

function isLink(value: unknown): value is Link {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.url === "string" &&
    typeof record.title === "string" &&
    typeof record.note === "string" &&
    Array.isArray(record.tags) &&
    record.tags.every((tag) => typeof tag === "string") &&
    typeof record.archived === "boolean" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

let tmpCounter = 0;

/**
 * Creates a file-backed store. This is the only module in src/lib/** that
 * touches the filesystem. Writes are atomic (temp file + fs.rename) and
 * serialized in-process so concurrent callers never lose an update.
 */
export function createStore(options: StoreOptions): Store {
  const filePath = options.filePath ?? DEFAULT_STORE_PATH;
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readAll(): Promise<Link[]> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isLink)) {
      throw new Error("Store file is corrupt.");
    }
    return parsed;
  }

  async function writeAll(links: Link[]): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${tmpCounter++}`;
    await writeFile(tmpPath, JSON.stringify(links, null, 2), "utf8");
    try {
      await rename(tmpPath, filePath);
    } catch (err) {
      await unlink(tmpPath).catch(() => undefined);
      throw err;
    }
  }

  async function add(input: AddLinkInput): Promise<Result<Link>> {
    return enqueue(async () => {
      const validation = validateLinkInput(input);
      if (!validation.ok) return validation;

      const links = await readAll();
      const { merged, link } = upsertLink(links, validation.value, () => ({
        id: options.nextId(),
        url: validation.value.url,
        title: validation.value.title,
        note: validation.value.note,
        tags: validation.value.tags,
        archived: false,
        createdAt: options.now(),
        updatedAt: options.now(),
      }));

      const next = merged
        ? links.map((l) => (l.id === link.id ? link : l))
        : [...links, link];
      await writeAll(next);
      return { ok: true, value: link };
    });
  }

  function setArchived(id: string, archived: boolean): Promise<Result<Link>> {
    return enqueue(async () => {
      const links = await readAll();
      const index = links.findIndex((l) => l.id === id);
      if (index === -1) {
        return { ok: false, message: "Link not found." };
      }

      const existing = links[index] as Link;
      const updated: Link = { ...existing, archived, updatedAt: options.now() };
      const next = [...links];
      next[index] = updated;
      await writeAll(next);
      return { ok: true, value: updated };
    });
  }

  return {
    add,
    async list(listOptions = {}): Promise<Link[]> {
      const links = await readAll();
      return sortLinks(filterLinks(links, listOptions), listOptions.sort);
    },
    async all(): Promise<Link[]> {
      return readAll();
    },
    archive(id: string): Promise<Result<Link>> {
      return setArchived(id, true);
    },
    restore(id: string): Promise<Result<Link>> {
      return setArchived(id, false);
    },
  };
}
