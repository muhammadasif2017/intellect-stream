# ADR-0005: Prisma 7 for Content Service data access

## Status
Accepted

## Date
2026-07-07

## Context
Milestone 3 needs a data access layer for the Content Service (Postgres). Hard requirement from the outbox pattern (ADR-0002): an explicit multi-statement transaction wrapping the business insert and the outbox insert. Soft requirements: strong TypeScript types, sane migration workflow, reasonable NestJS integration.

## Decision
Prisma 7, with the v7 architecture: root `prisma.config.ts` for CLI configuration, service-owned `schema.prisma` (no connection URL in schema — removed in v7), mandatory `@prisma/adapter-pg` driver adapter, client generated into `apps/content-service/src/generated/` (gitignored). Connection string flows through the zod-validated env (`shared-config`) via `ConfigService`, keeping one source of truth.

## Alternatives Considered

### TypeORM
- Pros: default NestJS integration, decorator style matches Nest idiom.
- Cons: weaker type safety (runtime-first), long-standing footguns around implicit behavior.
- Rejected: types and migration DX ranked higher than decorator symmetry.

### Drizzle / Kysely
- Pros: closest to SQL — most learning per line; excellent types.
- Cons: least NestJS glue; more hand-rolled patterns (migrations, client lifecycle).
- Rejected narrowly: viable, but Prisma's migration workflow better serves the milestone pace.

## Consequences
- Outbox transaction uses `prisma.$transaction`.
- `prisma generate` must run before build/serve when the schema changes (`pnpm db:generate`); the generated client is not committed.
- Prisma 7's generated client is ESM-first; `moduleFormat = "cjs"` is set in the generator block to match the NestJS webpack CJS build.
- Version note: v7 removed the Rust engine and made driver adapters mandatory — most pre-2026 tutorials show the obsolete v6 setup (`url` in schema, no adapter).
