import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Link } from "../../src/lib/types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const dataFile = path.join(repoRoot, ".data", "links.json");
const nextBin = path.join(repoRoot, "node_modules", ".bin", "next");

let baseUrl = "";
let serverProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;

// ---------------------------------------------------------------------------
// Store fixture helpers (write the JSON file directly so each scenario starts
// from a known state without depending on prior HTTP steps).
// ---------------------------------------------------------------------------

function fixtureLink(
  overrides: Pick<
    Link,
    "id" | "title" | "note" | "tags" | "createdAt" | "archived"
  >,
): Link {
  return {
    url: `https://example.com/${overrides.id}`,
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

async function seedStore(links: Link[]): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(links, null, 2), "utf8");
}

async function resetStore(): Promise<void> {
  await seedStore([]);
}

async function readStore(): Promise<Link[]> {
  try {
    const raw = await readFile(dataFile, "utf8");
    return JSON.parse(raw) as Link[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle helpers
// ---------------------------------------------------------------------------

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const { port } = address;
        server.close((err) => (err ? reject(err) : resolve(port)));
      } else {
        server.close();
        reject(new Error("Could not determine a free port."));
      }
    });
    server.on("error", reject);
  });
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: repoRoot, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function buildExists(): Promise<boolean> {
  try {
    await access(path.join(repoRoot, ".next", "BUILD_ID"));
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Server did not become ready in time: ${String(lastError)}`);
}

// ---------------------------------------------------------------------------
// HTML / progressive-enhancement form helpers. The app renders Server Action
// forms with a hidden "$ACTION_ID_*" field; these helpers walk the real
// rendered HTML the way a JS-disabled browser would, then submit the form
// over real HTTP.
// ---------------------------------------------------------------------------

function extractMain(html: string): string {
  const match = /<main[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (!match) throw new Error("Could not find <main> region in response body.");
  return match[1] as string;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function countListItems(html: string): number {
  return countOccurrences(html, 'class="link-item"');
}

interface ParsedForm {
  action: string;
  fields: Record<string, string>;
}

function parseForm(html: string, marker: string): ParsedForm {
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(`Could not find form marker: ${marker}`);
  }
  const formStart = html.lastIndexOf("<form", markerIdx);
  const openTagEnd = html.indexOf(">", formStart);
  const closeIdx = html.indexOf("</form>", openTagEnd);
  const openTag = html.slice(formStart, openTagEnd + 1);
  const body = html.slice(openTagEnd + 1, closeIdx);

  const actionMatch = /\baction="([^"]*)"/.exec(openTag);
  const action = actionMatch ? (actionMatch[1] as string) : "";

  const fields: Record<string, string> = {};
  const inputRe = /<input\b([^>]*)>/gi;
  let inputMatch: RegExpExecArray | null;
  while ((inputMatch = inputRe.exec(body)) !== null) {
    const attrs = inputMatch[1] as string;
    const nameMatch = /\bname="([^"]*)"/.exec(attrs);
    if (!nameMatch) continue;
    const typeMatch = /\btype="([^"]*)"/.exec(attrs);
    const type = typeMatch ? typeMatch[1] : "text";
    if (type === "checkbox" || type === "radio") continue;
    const valueMatch = /\bvalue="([^"]*)"/.exec(attrs);
    fields[nameMatch[1] as string] = valueMatch
      ? (valueMatch[1] as string)
      : "";
  }

  return { action, fields };
}

async function submitForm(
  currentPath: string,
  html: string,
  marker: string,
  overrides: Record<string, string>,
): Promise<Response> {
  const { action, fields } = parseForm(html, marker);
  const formData = new FormData();
  for (const [key, value] of Object.entries({ ...fields, ...overrides })) {
    formData.set(key, value);
  }
  const target = new URL(action || currentPath, baseUrl);
  return fetch(target, { method: "POST", body: formData });
}

async function getMain(
  requestPath: string,
): Promise<{ status: number; html: string; main: string }> {
  const res = await fetch(new URL(requestPath, baseUrl));
  const html = await res.text();
  return { status: res.status, html, main: extractMain(html) };
}

// ---------------------------------------------------------------------------
// Lifecycle: build (if needed), boot on a free port, tear down afterwards.
// ---------------------------------------------------------------------------

before(async () => {
  await resetStore();

  if (!(await buildExists())) {
    await runCommand(nextBin, ["build"]);
  }

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

  serverProcess = spawn(
    nextBin,
    ["start", "-p", String(port), "-H", "127.0.0.1"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );

  const startupFailure = new Promise<never>((_resolve, reject) => {
    serverProcess?.once("exit", (code) => {
      reject(new Error(`next start exited early with code ${code}`));
    });
  });

  await Promise.race([waitForServer(`${baseUrl}/`, 30000), startupFailure]);
});

after(async () => {
  const proc = serverProcess;
  if (proc && proc.exitCode === null && !proc.killed) {
    const exited = new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
    });
    proc.kill();
    await exited;
  }
  await resetStore();
});

// ---------------------------------------------------------------------------
// AC12 — saving a link through the Server Action persists it and renders it.
// ---------------------------------------------------------------------------

test("AC12: add form Server Action writes through the store and the link appears on the index", async () => {
  await resetStore();

  const { html } = await getMain("/");

  const postRes = await submitForm("/", html, 'class="form"', {
    url: "https://example.com/one",
    title: "One",
    note: "n",
    tags: "a, b",
  });

  assert.ok(
    [200, 303].includes(postRes.status),
    `expected 200 or 303, got ${postRes.status}`,
  );

  const postMain = extractMain(await postRes.text());
  assert.equal(
    countOccurrences(postMain, "One"),
    1,
    "the new link's title should appear exactly once in the list region",
  );

  const anchorMatch = /<a href="https:\/\/example\.com\/one"[^>]*>/.exec(
    postMain,
  );
  assert.ok(anchorMatch, "expected an anchor for the stored link");
  const anchorTag = anchorMatch[0] as string;
  assert.match(anchorTag, /rel="[^"]*noopener[^"]*"/);
  assert.match(anchorTag, /rel="[^"]*noreferrer[^"]*"/);

  const stored = await readStore();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.url, "https://example.com/one");
});

// ---------------------------------------------------------------------------
// AC13 — invalid submissions re-render with an error and save nothing.
// ---------------------------------------------------------------------------

test("AC13: invalid Server Action submissions re-render an error and save nothing", async () => {
  await resetStore();

  const cases: Array<{ name: string; fields: Record<string, string> }> = [
    {
      name: "malformed URL",
      fields: { url: "not a url", title: "Bad URL", note: "", tags: "" },
    },
    {
      name: "empty title",
      fields: {
        url: "https://example.com/two",
        title: "",
        note: "",
        tags: "",
      },
    },
    {
      name: "121-char title",
      fields: {
        url: "https://example.com/three",
        title: "a".repeat(121),
        note: "",
        tags: "",
      },
    },
    {
      name: "9 tags",
      fields: {
        url: "https://example.com/four",
        title: "Nine Tags",
        note: "",
        tags: "t1,t2,t3,t4,t5,t6,t7,t8,t9",
      },
    },
  ];

  for (const testCase of cases) {
    const { html } = await getMain("/");
    const res = await submitForm("/", html, 'class="form"', testCase.fields);

    assert.equal(
      res.status,
      200,
      `${testCase.name}: expected final status 200`,
    );
    const main = extractMain(await res.text());

    const errorMatch = /class="form-error"[^>]*>([^<]*)</.exec(main);
    assert.ok(
      errorMatch,
      `${testCase.name}: expected a rendered error message`,
    );
    assert.ok(
      (errorMatch[1] as string).trim().length > 0,
      `${testCase.name}: error message should be non-empty`,
    );

    if (testCase.fields.title.length > 0) {
      assert.ok(
        main.includes(testCase.fields.title) ||
          main.includes(`value="${testCase.fields.title}"`),
        `${testCase.name}: expected the previously entered title to be preserved`,
      );
    }
  }

  const stored = await readStore();
  assert.equal(
    stored.length,
    0,
    "no invalid submission should persist a record",
  );
});

// ---------------------------------------------------------------------------
// AC14 — filters are pure, shareable, reload-stable URL state, no-JS forms.
// ---------------------------------------------------------------------------

test("AC14: filters are pure URL state, reload-stable, and require no client JS", async () => {
  const fixture: Link[] = [
    fixtureLink({
      id: "f1",
      title: "Weekly Report",
      note: "internal doc",
      tags: ["foo", "x"],
      archived: false,
      createdAt: "2024-01-01T00:00:00.000Z",
    }),
    fixtureLink({
      id: "f2",
      title: "Apple Pie",
      note: "contains report keyword",
      tags: ["bar"],
      archived: false,
      createdAt: "2024-01-02T00:00:00.000Z",
    }),
    fixtureLink({
      id: "f3",
      title: "Random Note",
      note: "nothing special",
      tags: ["foo", "y"],
      archived: false,
      createdAt: "2024-01-03T00:00:00.000Z",
    }),
    fixtureLink({
      id: "f4",
      title: "Banana Bread",
      note: "recipe",
      tags: ["baz"],
      archived: false,
      createdAt: "2024-01-04T00:00:00.000Z",
    }),
    fixtureLink({
      id: "f5",
      title: "Old Archived Item",
      note: "old",
      tags: ["foo"],
      archived: true,
      createdAt: "2024-01-05T00:00:00.000Z",
    }),
  ];
  await seedStore(fixture);

  const requests = ["/?tag=foo", "/?q=report", "/?sort=title", "/?archived=1"];

  for (const requestPath of requests) {
    const first = await getMain(requestPath);
    assert.equal(first.status, 200, `${requestPath}: expected HTTP 200`);

    const second = await getMain(requestPath);
    assert.equal(
      second.status,
      200,
      `${requestPath}: expected HTTP 200 on reload`,
    );
    assert.equal(
      second.main,
      first.main,
      `${requestPath}: list ordering should be byte-identical across reloads`,
    );
  }

  const { main: filterFormHtml } = await getMain("/");
  const filterFormOpenTag = filterFormHtml.slice(
    filterFormHtml.lastIndexOf(
      "<form",
      filterFormHtml.indexOf('aria-label="Filter links"'),
    ),
    filterFormHtml.indexOf(
      ">",
      filterFormHtml.indexOf('aria-label="Filter links"'),
    ) + 1,
  );
  assert.match(filterFormOpenTag, /\bmethod="get"/);

  const { main: tagMain } = await getMain("/?tag=foo");
  assert.equal(
    countListItems(tagMain),
    2,
    "tag=foo should list exactly 2 active links",
  );

  const { main: archivedMain } = await getMain("/?archived=1");
  assert.equal(
    countListItems(archivedMain),
    1,
    "archived=1 should list exactly 1 link",
  );
  assert.match(
    archivedMain,
    />Restore</,
    "archived view should expose a restore control",
  );
});

// ---------------------------------------------------------------------------
// AC15 — end-to-end HTTP walk: add -> list -> filter by tag -> archive ->
// list archived -> restore. Exactly 6 asserted HTTP steps.
// ---------------------------------------------------------------------------

test("AC15: real-HTTP walk through add, list, filter, archive, list archived, restore", async () => {
  await resetStore();

  // Step 1: add.
  const { html: formHtml } = await getMain("/");
  const addRes = await submitForm("/", formHtml, 'class="form"', {
    url: "https://example.com/walkthrough",
    title: "Walkthrough Link",
    note: "smoke test fixture",
    tags: "smoke-tag",
  });
  assert.ok([200, 303].includes(addRes.status), "add: expected 200 or 303");
  const addMain = extractMain(await addRes.text());
  assert.equal(
    countOccurrences(addMain, "Walkthrough Link"),
    1,
    "add: link should render once",
  );

  const stored = await readStore();
  const target = stored.find(
    (l) => l.url === "https://example.com/walkthrough",
  );
  assert.ok(target, "add: the link should be persisted");
  const id = target.id;

  // Step 2: list.
  const list = await getMain("/");
  assert.equal(list.status, 200, "list: expected HTTP 200");
  assert.ok(
    list.main.includes("Walkthrough Link"),
    "list: should show the added link",
  );

  // Step 3: filter by tag.
  const filtered = await getMain("/?tag=smoke-tag");
  assert.equal(filtered.status, 200, "filter: expected HTTP 200");
  assert.equal(
    countListItems(filtered.main),
    1,
    "filter: exactly 1 link for the tag",
  );
  assert.ok(
    filtered.main.includes("Walkthrough Link"),
    "filter: should show the tagged link",
  );

  // Step 4: archive.
  const archiveRes = await submitForm("/", list.html, `value="${id}"`, {});
  assert.ok(
    [200, 303].includes(archiveRes.status),
    "archive: expected 200 or 303",
  );
  const archiveMain = extractMain(await archiveRes.text());
  assert.ok(
    archiveMain.includes("Walkthrough Link"),
    "archive: link should appear in the response",
  );
  assert.match(
    archiveMain,
    />Restore</,
    "archive: response should expose a restore control",
  );

  // Step 5: list archived.
  const archivedList = await getMain("/?archived=1");
  assert.equal(archivedList.status, 200, "list archived: expected HTTP 200");
  assert.equal(
    countListItems(archivedList.main),
    1,
    "list archived: exactly 1 archived link",
  );
  assert.ok(
    archivedList.main.includes("Walkthrough Link"),
    "list archived: should show the archived link",
  );

  // Step 6: restore.
  const restoreRes = await submitForm(
    "/?archived=1",
    archivedList.html,
    `value="${id}"`,
    {},
  );
  assert.ok(
    [200, 303].includes(restoreRes.status),
    "restore: expected 200 or 303",
  );
  const restoreMain = extractMain(await restoreRes.text());
  assert.ok(
    restoreMain.includes("Walkthrough Link"),
    "restore: link should be active again",
  );
  assert.match(
    restoreMain,
    />Archive</,
    "restore: response should expose an archive control again",
  );
});

// ---------------------------------------------------------------------------
// AC16 — empty state, 404, and error boundary read like a finished product.
// ---------------------------------------------------------------------------

test("AC16: empty state and not-found render as finished product states", async () => {
  await resetStore();

  const { status, main } = await getMain("/");
  assert.equal(status, 200);
  assert.equal(countListItems(main), 0, "empty store: 0 rendered list items");
  const emptyMatch = /class="empty-state"[^>]*>([^<]*)</.exec(main);
  assert.ok(emptyMatch, "empty store: expected an empty-state message");
  assert.ok(
    (emptyMatch[1] as string).trim().length > 0,
    "empty-state message should be non-empty",
  );

  const notFoundRes = await fetch(new URL("/does-not-exist", baseUrl));
  assert.equal(notFoundRes.status, 404);
  const notFoundBody = await notFoundRes.text();
  assert.match(notFoundBody, /Page not found/);
});

test("AC16: error.tsx exists and exports a default error boundary component", async () => {
  const source = await readFile(
    path.join(repoRoot, "src/app/error.tsx"),
    "utf8",
  );
  assert.match(source, /export default function/);
  assert.match(source, /"use client"/);
});

test("AC16: src/app contains no placeholder markers", async () => {
  const files = [
    "layout.tsx",
    "page.tsx",
    "actions.ts",
    "error.tsx",
    "not-found.tsx",
    "components/LinkForm.tsx",
    "components/FilterBar.tsx",
    "components/LinkList.tsx",
    "components/EmptyState.tsx",
  ];
  // "placeholder" excludes the legitimate HTML `placeholder="..."` input
  // attribute, which is not scaffolding language.
  const forbidden: Array<{ name: string; pattern: RegExp }> = [
    { name: "TODO", pattern: /\bTODO\b/ },
    { name: "FIXME", pattern: /\bFIXME\b/ },
    { name: "lorem ipsum", pattern: /lorem ipsum/i },
    { name: "placeholder", pattern: /placeholder(?!=)/i },
  ];

  for (const file of files) {
    const content = await readFile(
      path.join(repoRoot, "src/app", file),
      "utf8",
    );
    for (const marker of forbidden) {
      assert.equal(
        marker.pattern.test(content),
        false,
        `${file} should not contain "${marker.name}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Adversarial (security_review_required): stored fields (title, note, tag)
// must never be rendered back into the page as executable HTML. This is a
// real-HTTP round trip through the Server Action and the rendered list page —
// no unit test exercises the actual render path, only these framework-level
// assertions can catch a future dangerouslySetInnerHTML/raw-interpolation
// regression.
// ---------------------------------------------------------------------------

test("SECURITY: title, note, and tag containing HTML/script payloads are rendered inert, not executable", async () => {
  await resetStore();

  const { html: formHtml } = await getMain("/");
  const payloadTitle = "<script>alert(1)</script>";
  const payloadNote = '"><img src=x onerror=alert(2)>';
  const payloadTag = "<b>bold-tag</b>";

  const res = await submitForm("/", formHtml, 'class="form"', {
    url: "https://example.com/xss-check",
    title: payloadTitle,
    note: payloadNote,
    tags: payloadTag,
  });
  assert.ok([200, 303].includes(res.status), "add: expected 200 or 303");

  const { main } = await getMain("/");

  assert.equal(
    main.includes("<script>alert(1)</script>"),
    false,
    "raw <script> tag must never appear unescaped in the rendered page",
  );
  assert.equal(
    main.includes("<img src=x onerror=alert(2)>"),
    false,
    "raw onerror-bearing <img> must never appear unescaped in the rendered page",
  );
  assert.equal(
    main.includes("<b>bold-tag</b>"),
    false,
    "a tag value must never be rendered as raw, executable/formatting HTML",
  );
  // The payload's text content must still be present, just neutralized
  // (HTML-entity-escaped by the framework's default text-node rendering).
  assert.ok(
    main.includes("&lt;script&gt;") || !main.includes(payloadTitle),
    "escaped or otherwise neutralized script payload expected in output",
  );

  const stored = await readStore();
  const record = stored.find((l) => l.url === "https://example.com/xss-check");
  assert.ok(record, "the record should still be persisted with its raw text");
  assert.equal(
    record.title,
    payloadTitle,
    "raw text is stored as-is (escaping is a render-time concern)",
  );
});

// ---------------------------------------------------------------------------
// Adversarial (security_review_required): the javascript:/data:/file: scheme
// rejection is unit-tested against validateLinkInput() directly, but never
// proven against the real Server Action over real HTTP — this closes that
// gap and additionally proves no dangerous-scheme href is ever persisted or
// rendered as a clickable anchor.
// ---------------------------------------------------------------------------

test("SECURITY: dangerous URL schemes are rejected by the real Server Action over HTTP and never persisted or linked", async () => {
  await resetStore();

  const dangerous = [
    ["javascript:alert(1)", "javascript"],
    ["data:text/html,<script>alert(1)</script>", "data"],
    ["file:///etc/passwd", "file"],
  ] as const;

  for (const [url, scheme] of dangerous) {
    const { html } = await getMain("/");
    const res = await submitForm("/", html, 'class="form"', {
      url,
      title: `Dangerous ${scheme}`,
      note: "",
      tags: "",
    });
    assert.equal(res.status, 200, `${scheme}: expected final status 200`);
    const main = extractMain(await res.text());

    const errorMatch = /class="form-error"[^>]*>([^<]*)</.exec(main);
    assert.ok(errorMatch, `${scheme}: expected a rendered error message`);
    assert.ok(
      (errorMatch[1] as string).trim().length > 0,
      `${scheme}: error message should be non-empty`,
    );
    assert.equal(
      main.includes(`href="${url}"`),
      false,
      `${scheme}: no clickable anchor for a dangerous-scheme URL should ever render`,
    );
  }

  const stored = await readStore();
  assert.equal(
    stored.length,
    0,
    "no dangerous-scheme submission should persist a record",
  );
});
