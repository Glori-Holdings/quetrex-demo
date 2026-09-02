import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../../src/lib/store.ts";
import type { AddLinkInput } from "../../src/lib/types.ts";

async function withTempStore(
  fn: (dataFile: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "link-library-store-"));
  const dataFile = path.join(dir, "links.json");
  try {
    await fn(dataFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function seedInputs(): AddLinkInput[] {
  return Array.from({ length: 5 }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: `Link ${i}`,
    tags: [],
  }));
}

test("archive hides a link from the default list and reveals it in the archived list; restore reverses it; nothing is hard-deleted", async () => {
  await withTempStore(async (dataFile) => {
    let counter = 0;
    let now = 0;
    const store = createStore({
      filePath: dataFile,
      now: () => `2024-01-0${++now}T00:00:00.000Z`,
      nextId: () => `id-${counter++}`,
    });

    const ids: string[] = [];
    for (const input of seedInputs()) {
      const result = await store.add(input);
      assert.equal(result.ok, true);
      if (result.ok) ids.push(result.value.id);
    }

    assert.equal((await store.all()).length, 5);

    const target = ids[0];
    assert.ok(target);

    const archived = await store.archive(target);
    assert.equal(archived.ok, true);

    assert.equal(
      (await store.list()).length,
      4,
      "default list length after archive",
    );
    assert.equal(
      (await store.list({ archived: true })).length,
      1,
      "archived list length after archive",
    );
    assert.equal(
      (await store.all()).length,
      5,
      "total record count unchanged after archive",
    );

    const restored = await store.restore(target);
    assert.equal(restored.ok, true);

    assert.equal(
      (await store.list()).length,
      5,
      "default list length after restore",
    );
    assert.equal(
      (await store.list({ archived: true })).length,
      0,
      "archived list length after restore",
    );
    assert.equal(
      (await store.all()).length,
      5,
      "total record count unchanged after restore",
    );

    const unknown = await store.archive("does-not-exist");
    assert.equal(unknown.ok, false, "archiving an unknown id fails");
    assert.equal(
      (await store.all()).length,
      5,
      "count unchanged after failed archive",
    );
  });
});

// ---------------------------------------------------------------------------
// Adversarial: security_surface item "a corrupt or non-conforming store file
// is rejected rather than trusted." This path (readAll's shape guard) was
// unexercised by the rest of the suite per node's own coverage report.
// ---------------------------------------------------------------------------

test("a store file that is valid JSON but not an array of Links is rejected, not silently trusted", async () => {
  await withTempStore(async (dataFile) => {
    await writeFile(
      dataFile,
      JSON.stringify({ not: "an array of links" }),
      "utf8",
    );

    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => "id-0",
    });

    await assert.rejects(() => store.all(), /corrupt/i);
    await assert.rejects(() => store.list(), /corrupt/i);
  });
});

test("a store file with a malformed link shape (missing required fields) is rejected", async () => {
  await withTempStore(async (dataFile) => {
    await writeFile(
      dataFile,
      JSON.stringify([{ id: "x", url: "https://example.com/a" }]),
      "utf8",
    );

    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => "id-0",
    });

    await assert.rejects(() => store.all(), /corrupt/i);
  });
});

test("a store file that is not valid JSON at all is rejected rather than trusted", async () => {
  await withTempStore(async (dataFile) => {
    await writeFile(dataFile, "{ not valid json", "utf8");

    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => "id-0",
    });

    await assert.rejects(() => store.all());
  });
});
