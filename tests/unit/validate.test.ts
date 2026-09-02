import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateLinkInput } from "../../src/lib/validate.ts";
import { createStore } from "../../src/lib/store.ts";
import type { AddLinkInput } from "../../src/lib/types.ts";

const validBase: AddLinkInput = {
  url: "https://example.com/a",
  title: "A title",
  tags: [],
};

const invalidCases: Array<[string, AddLinkInput]> = [
  ["malformed URL", { ...validBase, url: "not a url" }],
  ["empty title", { ...validBase, title: "" }],
  ["121-character title", { ...validBase, title: "x".repeat(121) }],
  [
    "9 tags",
    { ...validBase, tags: Array.from({ length: 9 }, (_, i) => `tag${i}`) },
  ],
  ["javascript scheme", { ...validBase, url: "javascript:alert(1)" }],
  ["data scheme", { ...validBase, url: "data:text/html,x" }],
  ["file scheme", { ...validBase, url: "file:///etc/passwd" }],
];

test("validateLinkInput rejects 7 invalid inputs with a readable message", () => {
  for (const [name, input] of invalidCases) {
    const result = validateLinkInput(input);
    assert.equal(result.ok, false, `expected rejection for: ${name}`);
    if (!result.ok) {
      assert.ok(
        result.message.length > 0,
        `expected non-empty message for: ${name}`,
      );
    }
  }
});

test("validateLinkInput accepts boundary cases: 120-char title and 8 tags", () => {
  const titleBoundary = validateLinkInput({
    ...validBase,
    title: "x".repeat(120),
  });
  assert.equal(titleBoundary.ok, true);

  const tagsBoundary = validateLinkInput({
    ...validBase,
    tags: Array.from({ length: 8 }, (_, i) => `tag${i}`),
  });
  assert.equal(tagsBoundary.ok, true);
});

async function withTempStore(
  fn: (dataFile: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "link-library-validate-"));
  const dataFile = path.join(dir, "links.json");
  try {
    await fn(dataFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("nothing is persisted across all 7 invalid inputs; store stays empty", async () => {
  await withTempStore(async (dataFile) => {
    let counter = 0;
    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => `id-${counter++}`,
    });

    for (const [, input] of invalidCases) {
      const result = await store.add(input);
      assert.equal(result.ok, false);
    }

    assert.equal((await store.all()).length, 0);
  });
});

test("boundary cases bring store record count to exactly 1 each", async () => {
  await withTempStore(async (dataFile) => {
    let counter = 0;
    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => `id-${counter++}`,
    });

    const result = await store.add({ ...validBase, title: "x".repeat(120) });
    assert.equal(result.ok, true);
    assert.equal((await store.all()).length, 1);
  });
});
