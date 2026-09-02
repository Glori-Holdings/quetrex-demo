# Link Library

A Next.js App Router + TypeScript-strict app for saving, tagging, and filtering links.

Pure logic (URL normalization, validation, dedupe, filter, search, sort) lives in
framework-free modules under `src/lib/`, behind a narrow file-backed store seam
(`src/lib/store.ts`) that persists to a single atomically-written JSON file under
`.data/links.json`.

## Getting started

```bash
npm install
npm run dev
```

## Verification

Run in this order — all must pass before any PR:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs the Node built-in test runner (`node --test`) over `tests/unit/**`
and `tests/smoke/**`. No test framework, no network access, and no environment
variables are required.
