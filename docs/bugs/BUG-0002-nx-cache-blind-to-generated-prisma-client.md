# BUG-0002: `nx build`/`serve` silently served stale code after a Prisma schema change

**Found:** 2026-07-08, while manually verifying the outbox transaction against a live server
**Status:** Fixed

## Symptom

Added `OutboxMessage` to `schema.prisma`, ran `pnpm db:generate`, updated
`PostsService.create()` to write both `Post` and `OutboxMessage` in one
`$transaction`. Ran `pnpm nx serve content-service`, hit `POST /api/posts`:

```
[Nest] ERROR [ExceptionsHandler] TypeError: Cannot read properties of undefined (reading 'create')
    at posts.service.ts:17:30   (tx.outboxMessage.create)
```

But the generated client on disk *did* have an `outboxMessage` delegate
(confirmed via grep on `internal/class.ts`) — the running server just wasn't
using it. The build log showed:

```
> nx run content-service:build:development [local cache]
Nx read the output from the cache instead of running the command for 1 out of 1 tasks.
```

Nx served a cached bundle built before the schema/service change, despite the
source files on disk being newer.

## Root cause

`apps/*/src/generated` is gitignored (`.gitignore:57`, `# prisma generated client`).
Nx's default file-hasher only sees git-tracked files when computing a project's
`default` named input hash (`{projectRoot}/**/*`) — gitignored files are invisible
to it entirely, regardless of what glob patterns are listed in `inputs`. So
regenerating the Prisma client (or even editing `schema.prisma`, since the
*consequence* that matters — the generated `.ts` files — is what's actually
imported) never changed the `build` target's computed hash, and Nx kept
replaying the old cached output.

This wasn't a one-off — no project in the workspace had ever wired Prisma
generation into the Nx task graph. `pnpm db:generate` was a plain root
`package.json` script, invisible to Nx entirely.

## Fix

Gave `content-service` its own `prisma-generate` Nx target and made `build`/`test`
depend on it (`apps/content-service/project.json`). Task-graph `dependsOn`
hashing composes the *upstream task's* hash into the downstream task's hash —
it doesn't require hashing the (gitignored, invisible-to-Nx) output directory
directly, so this sidesteps the gitignore blindness entirely.

First attempt cached the `prisma-generate` target itself (`"cache": true` +
declared `outputs`) — that introduced a worse bug, see
[BUG-0003](./BUG-0003-nx-cache-corrupted-prisma-client.md). Final fix runs
`prisma-generate` uncached (`"cache": false`) every time — generation is
~150-400ms, cheap enough that always-fresh beats cached-but-fragile.

## Prevention

Any codegen step whose output is gitignored (build artifacts, generated
clients, etc.) must be wired into the Nx project graph as a real target with
a `dependsOn` edge from whatever consumes it — never left as a bare shell
script invoked outside Nx. Nx cannot reason about files it can't see.
