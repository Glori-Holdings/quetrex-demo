import { test } from "node:test";
import assert from "node:assert/strict";
import { filterLinks } from "../../src/lib/query.ts";
import { sortLinks } from "../../src/lib/query.ts";
import type { Link } from "../../src/lib/types.ts";

function link(
  overrides: Partial<Link> &
    Pick<Link, "id" | "title" | "note" | "tags" | "createdAt">,
): Link {
  return {
    url: `https://example.com/${overrides.id}`,
    archived: false,
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

const fixture: Link[] = [
  link({
    id: "l1",
    title: "Weekly Report",
    note: "internal doc",
    tags: ["foo", "x"],
    createdAt: "2024-01-01T00:00:00.000Z",
  }),
  link({
    id: "l2",
    title: "apple pie",
    note: "contains REPORT keyword",
    tags: ["bar"],
    createdAt: "2024-01-02T00:00:00.000Z",
  }),
  link({
    id: "l3",
    title: "Random note",
    note: "nothing special",
    tags: ["foo", "y"],
    createdAt: "2024-01-03T00:00:00.000Z",
  }),
  link({
    id: "l4",
    title: "Zephyr",
    note: "zzz",
    tags: ["baz"],
    createdAt: "2024-01-04T00:00:00.000Z",
  }),
  link({
    id: "l5",
    title: "Banana split",
    note: "other",
    tags: ["qux"],
    createdAt: "2024-01-05T00:00:00.000Z",
  }),
];

function ids(links: Link[]): string[] {
  return links.map((l) => l.id);
}

test("filterLinks: tag is an exact match on the tag array", () => {
  const result = filterLinks(fixture, { tag: "foo" });
  assert.deepEqual(ids(result), ["l1", "l3"]);
});

test("filterLinks: q matches title OR note, case-insensitively", () => {
  const result = filterLinks(fixture, { q: "REPORT" });
  assert.deepEqual(ids(result), ["l1", "l2"]);
  assert.ok(
    result[0]?.title.toLowerCase().includes("report"),
    "l1 is a title-only match",
  );
  assert.ok(!result[0]?.note.toLowerCase().includes("report"));
  assert.ok(
    result[1]?.note.toLowerCase().includes("report"),
    "l2 is a note-only match",
  );
  assert.ok(!result[1]?.title.toLowerCase().includes("report"));
});

test("filterLinks: a no-match query returns an empty list, not an error", () => {
  const result = filterLinks(fixture, { q: "zzz-no-match" });
  assert.deepEqual(result, []);
});

test("filterLinks: combined tag + q filters intersect", () => {
  const result = filterLinks(fixture, { tag: "foo", q: "REPORT" });
  assert.deepEqual(ids(result), ["l1"]);
});

test("sortLinks: default mode is newest-first by createdAt descending", () => {
  const result = sortLinks(fixture);
  assert.deepEqual(ids(result), ["l5", "l4", "l3", "l2", "l1"]);
});

test("sortLinks: title mode is case-insensitive ascending by title", () => {
  const result = sortLinks(fixture, "title");
  assert.deepEqual(ids(result), ["l2", "l5", "l3", "l1", "l4"]);
});

test("sortLinks: an unknown sort value falls back to the default sequence", () => {
  const result = sortLinks(fixture, "bogus-sort");
  assert.deepEqual(ids(result), ["l5", "l4", "l3", "l2", "l1"]);
});
