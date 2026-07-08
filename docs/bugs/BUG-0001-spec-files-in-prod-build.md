# BUG-0001: Test files compiled into production bundle

**Found:** 2026-07-08, CI run on `content-service/post-crud` (`nx run-many -t lint test build`)
**Status:** Fixed

## Symptom

`content-service:build` failed in CI with TS errors from `posts.service.spec.ts`:

```
ERROR in ./src/app/posts/posts.service.spec.ts:68:3
TS2593: Cannot find name 'it'. Do you need to install type definitions for a
test runner? Try `npm i --save-dev @types/jest` ...
ERROR in ./src/app/posts/posts.service.spec.ts:71:11
TS2304: Cannot find name 'expect'.
```

`lint` and `test` both passed locally before push — only `build` failed, and only in the
production target.

## Root cause

`apps/content-service/tsconfig.app.json` had:

```json
"include": ["src/**/*.ts"]
```

with no `exclude`. Webpack's production build compiles everything matched by
`tsconfig.app.json`, so `posts.service.spec.ts` got pulled into the app bundle.
`tsconfig.app.json` declares `"types": ["node"]` only (no `jest`), so `it`/`expect`
resolve to nothing — hence the TS errors, only at build time, not test time
(`tsconfig.spec.json` has `"types": ["jest", "node"]` and does resolve them,
so `nx test` never saw a problem).

## Fix

Added an explicit exclude:

```json
"include": ["src/**/*.ts"],
"exclude": [
  "jest.config.ts",
  "src/**/*.spec.ts",
  "src/**/*.test.ts"
]
```

## Why it wasn't caught earlier

`content-service` had no `test` target at all until this same work session (see
[nx-workspace-setup.md](../nx-workspace-setup.md) gap) — `jest.config.ts` +
`tsconfig.spec.json` were added alongside the first spec file, and the app/spec
split convention (that `libs/*` already had) wasn't carried over to `tsconfig.app.json`
at the same time.

## Prevention

When adding a `jest.config.ts`/`tsconfig.spec.json` to a project that didn't have one,
always check the sibling `tsconfig.app.json` (or `tsconfig.lib.json`) has a matching
`exclude` for spec/test files — the split only works if both halves agree on which
files belong to which config.
