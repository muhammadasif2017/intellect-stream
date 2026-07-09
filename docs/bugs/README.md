# Bug Log

Bugs found during development, with root cause and fix. Not a support ticket queue —
a record for later root-cause reference, since these gotchas tend to repeat in
Nx/Prisma monorepos and are non-obvious from the code alone.

| ID | Title | Root cause category |
|---|---|---|
| [BUG-0001](./BUG-0001-spec-files-in-prod-build.md) | Test files compiled into production bundle | Missing tsconfig exclude |
| [BUG-0002](./BUG-0002-nx-cache-blind-to-generated-prisma-client.md) | `nx build`/`serve` silently served stale code after schema change | Nx cache blind to gitignored output |
| [BUG-0003](./BUG-0003-nx-cache-corrupted-prisma-client.md) | Caching the fix for BUG-0002 corrupted the generated client | Nx output-caching race/corruption |
| [BUG-0004](./BUG-0004-docker-containers-auto-paused.md) | `P1001: Can't reach database server` despite containers "running" | Docker Desktop auto-paused containers |
| [BUG-0005](./BUG-0005-dual-write-hazard-in-analytics-publish-design.md) | First-draft Analytics publish design dual-writes RabbitMQ+Kafka with no shared transaction | Ad-hoc second publish bypassing the outbox |
