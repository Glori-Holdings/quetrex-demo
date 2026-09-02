import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../../src/lib/url.ts";

const cases: Array<[string, string]> = [
  [
    "HTTPS://Example.COM/Path/?utm_source=a&utm_medium=b&utm_campaign=c&ref=keep",
    "https://example.com/Path?ref=keep",
  ],
  ["HTTPS://Example.COM/path", "https://example.com/path"],
  ["https://example.com/", "https://example.com"],
  ["https://example.com/path/", "https://example.com/path"],
  [
    "https://example.com/path?utm_source=a&keep=1",
    "https://example.com/path?keep=1",
  ],
  [
    "https://example.com/path?utm_medium=b&keep=1",
    "https://example.com/path?keep=1",
  ],
  [
    "https://example.com/path?utm_campaign=c&keep=1",
    "https://example.com/path?keep=1",
  ],
  [
    "https://example.com/path?b=2&a=1&utm_source=x",
    "https://example.com/path?b=2&a=1",
  ],
  ["https://example.com/path#Section", "https://example.com/path#Section"],
];

test("normalizeUrl produces the exact expected output for each case", () => {
  for (const [input, expected] of cases) {
    assert.equal(normalizeUrl(input), expected, `input: ${input}`);
  }
});

test("normalizeUrl strips every utm_* parameter across all cases", () => {
  for (const [input] of cases) {
    const output = normalizeUrl(input);
    const params = new URL(output).searchParams;
    for (const key of params.keys()) {
      assert.equal(
        key.toLowerCase().startsWith("utm_"),
        false,
        `leaked utm param in: ${output}`,
      );
    }
  }
});

test("normalizeUrl is idempotent for every case", () => {
  for (const [input] of cases) {
    const once = normalizeUrl(input);
    assert.equal(normalizeUrl(once), once, `not idempotent: ${input}`);
  }
});
