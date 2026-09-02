import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../../src/lib/store.ts";

async function withTempStore(
  fn: (dataFile: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "link-library-dedupe-"));
  const dataFile = path.join(dir, "links.json");
  try {
    await fn(dataFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("adding the same normalized URL twice merges tags instead of creating a second record", async () => {
  await withTempStore(async (dataFile) => {
    let counter = 0;
    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => `id-${counter++}`,
    });

    const first = await store.add({
      url: "https://example.com/a/",
      title: "First",
      tags: ["x", "y"],
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const second = await store.add({
      url: "HTTPS://Example.com/a?utm_source=z",
      title: "Second",
      tags: ["y", "w"],
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;

    const all = await store.all();
    assert.equal(all.length, 1, "exactly 1 record after both adds");

    const record = all[0];
    assert.ok(record);
    assert.equal(record?.tags.length, 3, "tags length is exactly 3");
    assert.deepEqual(new Set(record?.tags), new Set(["x", "y", "w"]));
    assert.equal(record?.id, first.value.id, "0 new ids allocated on merge");
    assert.equal(second.value.id, first.value.id);
  });
});
