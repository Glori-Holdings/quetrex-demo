import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
