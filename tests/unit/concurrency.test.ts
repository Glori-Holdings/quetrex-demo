import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../../src/lib/store.ts";

async function runOnce(): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "link-library-concurrency-"));
  const dataFile = path.join(dir, "links.json");
  try {
    let counter = 0;
    const store = createStore({
      filePath: dataFile,
      now: () => "2024-01-01T00:00:00.000Z",
      nextId: () => `id-${counter++}`,
    });

    const inputs = Array.from({ length: 20 }, (_, i) => ({
      url: `https://example.com/link-${i}`,
      title: `Link ${i}`,
      tags: [],
    }));

    const results = await Promise.all(inputs.map((input) => store.add(input)));
    for (const result of results) {
      assert.equal(result.ok, true, "every write survives");
    }

    const raw = await readFile(dataFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    assert.ok(Array.isArray(parsed), "JSON.parse succeeds and yields an array");
    const records = parsed as Array<{ id: string; url: string }>;

    assert.equal(records.length, 20, "record count is exactly 20");
    assert.equal(new Set(records.map((r) => r.id)).size, 20, "20 distinct ids");
    assert.equal(
      new Set(records.map((r) => r.url)).size,
      20,
      "20 distinct normalized urls",
    );

    const leftovers = (await readdir(dir)).filter((name) =>
      name.includes(".tmp-"),
    );
    assert.equal(leftovers.length, 0, "0 leftover temp files");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("20 concurrent add() calls all survive without truncation or lost writes, repeated 3 times", async () => {
  await runOnce();
  await runOnce();
  await runOnce();
});
