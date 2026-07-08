# BUG-0003: Caching the BUG-0002 fix corrupted the generated Prisma client

**Found:** 2026-07-08, immediately after landing the first fix for BUG-0002
**Status:** Fixed

## Symptom

First fix for BUG-0002 added a `prisma-generate` target with `"cache": true`
and `"outputs": ["{projectRoot}/src/generated/prisma"]`. Running `nx build`
twice in a row to confirm caching worked:

```
NX   Nx detected a flaky task
  content-service:prisma-generate
```

...followed by `content-service:build` failing with TypeScript errors that
made no sense for unchanged code:

```
TS2339: Property 'post' does not exist on type 'PrismaService'.
TS2339: Property '$connect' does not exist on type 'PrismaService'.
```

Inspecting the generated output directly: `internal/class.ts` and
`internal/prismaNamespace.ts` — the files defining the `PrismaClient` class
and all its model delegates — were gone. Only 5 of the expected 10 generated
files remained (`browser.ts`, `client.ts`, `commonInputTypes.ts`, `enums.ts`,
`models.ts`); `client.ts` still `import`ed from `./internal/class`, which no
longer existed on disk.

## Root cause

Not fully root-caused at the Nx internals level — the practical trigger was
declaring `outputs` + `cache: true` on a codegen target whose output directory
is gitignored. Nx's flaky-task detector reran the task and compared results;
somewhere in that rerun/cache-restore cycle, the output directory ended up
with a partial file set (best working theory: a cache restore overwrote a
fresh, complete generation with an incomplete snapshot captured from an
earlier interrupted run — several manual `prisma generate` invocations had
been run and cancelled earlier in this session while iterating on the fix).

Not chasing this further, because the underlying tradeoff isn't worth it: the
command itself runs in a few hundred milliseconds. Caching a task whose
correctness depends on a full, uncorrupted directory snapshot — for a task
that's already nearly free to just rerun — isn't a good trade.

## Fix

Removed `"cache": true` and the `outputs` declaration from `prisma-generate`
entirely. It now always executes:

```json
"prisma-generate": {
  "cache": false,
  "executor": "nx:run-commands",
  "options": { "command": "prisma generate" }
}
```

`build`/`test` still `dependsOn: ["prisma-generate"]`, so ordering and
downstream cache invalidation (BUG-0002's actual fix) are unaffected —
`cache: false` only means *this* target's own command always runs; it doesn't
stop its hash from composing into dependents' hashes.

Regenerated the corrupted directory with `pnpm db:generate` and confirmed the
full 10-file set was restored before re-verifying build/test.

## Prevention

Don't cache codegen steps that regenerate a whole directory tree from
scratch (as opposed to incrementally) unless the command is genuinely
expensive — the corruption blast radius (silently broken generated code,
manifesting as confusing downstream type errors) outweighs the savings for
anything sub-second.
