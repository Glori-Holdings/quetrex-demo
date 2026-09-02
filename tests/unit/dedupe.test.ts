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

test("re-adding the URL of an archived link un-archives it and it becomes visible in list()", async () => {
  await withTempStore(async (dataFile) => {
    let counter = 0;
    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => `id-${counter++}`,
    });

    const added = await store.add({
      url: "https://example.com/a",
      title: "First",
      tags: [],
    });
    assert.equal(added.ok, true);
    if (!added.ok) return;

    const archived = await store.archive(added.value.id);
    assert.equal(archived.ok, true);
    assert.equal(
      (await store.list()).length,
      0,
      "archived link is hidden from the default list",
    );

    const readded = await store.add({
      url: "https://example.com/a",
      title: "First again",
      tags: [],
    });
    assert.equal(readded.ok, true);
    if (!readded.ok) return;

    assert.equal(
      readded.value.archived,
      false,
      "re-added record is no longer archived",
    );

    const visible = await store.list();
    assert.equal(
      visible.length,
      1,
      "re-added link is visible in the default list",
    );
    assert.equal(
      visible[0]?.id,
      added.value.id,
      "0 new ids allocated on merge",
    );
  });
});
