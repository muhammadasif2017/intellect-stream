# ADR-0011: Integration test approach — real docker-compose infra, own `integration` nx target

## Status
Accepted

## Date
2026-07-10

## Context
Milestone 8 needed end-to-end proof that the golden path actually works
across process boundaries: post → outbox → RabbitMQ → AI Processing
(Cloudflare Workers AI mocked — real paid API, no configurable endpoint) →
RabbitMQ → Content Service updates + re-outboxes → Kafka → Analytics Service
persists a trend row + Notification Service pushes to a registered socket.
Unit tests per service can't catch wiring bugs at those boundaries (message
envelope mismatches, routing config errors, dedupe logic that only breaks
under a real broker).

Two open questions needed resolving: what infra backs the tests (ephemeral
containers vs. the existing dev stack), and how the tests are wired into Nx
so they don't get swept into CI targets that have no live infra to run
against. This was originally picked autonomously (engineer unavailable,
asked to keep going) and logged in `SPEC.md` as proposed pending review —
accepted as-is at decision 23 without changes.

## Decision
**Reuse the project's existing long-lived docker-compose stack** (Redis,
RabbitMQ, Kafka, Postgres — the same one the Quick Start assumes is up
before `nx serve`), not `testcontainers` or any ephemeral-container
orchestration. The repo has no `testcontainers` dependency; standing one up
would be new machinery solely for tests when a stack that already satisfies
the same infra shape is one `docker-compose up` away.

New `apps/e2e-tests` project:
- `jest.integration.config.ts` — deliberately *not* named `jest.config.ts`,
  so `@nx/jest`'s plugin doesn't auto-infer a `test` target and sweep these
  into `nx run-many -t test` / CI, which has no live infra to run against.
- A single Nx target, `integration` (`nx run e2e-tests:integration`), backed
  by `nx:run-commands` running
  `jest --config apps/e2e-tests/jest.integration.config.ts --runInBand --forceExit`.
  `--runInBand` avoids two suites racing on the same shared broker/DB state;
  `--forceExit` is a workaround, not a fix (see Consequences).

Two specs:
1. `rabbitmq-roundtrip.integration.spec.ts` — a feasibility probe: real
   publish/consume through `shared-messaging`'s actual classes, proving the
   environment can run tests against real infra before anything bigger is
   built on top.
2. `golden-path.integration.spec.ts` — the full path described in Context.
   Bootstraps all four services' real `AppModule`s in-process via
   `NestFactory.createApplicationContext`, importing each app's module
   directly across `apps/*/src` — a deliberate cross-app-import deviation
   from this workspace's normal Nx module-boundary rules, each import
   flagged inline with `// eslint-disable-next-line @nx/enforce-module-boundaries`,
   done only for this test-wiring purpose.

## Alternatives Considered

### testcontainers (ephemeral containers per test run)
- Pros: hermetic — no dependency on a stack being up beforehand, closer to
  how CI would isolate a run, no state leakage between runs.
- Cons: new dependency and new orchestration code for infra this repo
  already runs continuously in dev; startup latency per suite run.
- Rejected: this repo already runs a persistent docker-compose stack as a
  dev-time assumption (Quick Start requires it before `nx serve`); adding a
  second, ephemeral way to stand up the same Redis/RabbitMQ/Kafka/Postgres
  shape is more machinery, not less, for a project at this scale.

### Swept into the normal `test` target (via `@nx/jest`'s inferred `jest.config.ts`)
- Pros: one command (`nx run-many -t test`) runs everything, no separate
  target to remember.
- Cons: CI and any environment without the docker-compose stack up would
  fail or hang on tests that need live brokers/DB — indistinguishable from
  a real regression.
- Rejected: naming the config `jest.integration.config.ts` keeps `@nx/jest`
  from auto-inferring a `test` target for this project at all, so these
  tests only run when explicitly invoked via `integration`.

## Consequences
- `nx run e2e-tests:integration` requires the docker-compose stack to
  already be up — not a self-contained CI job. Running it in CI would need
  the stack started as a prerequisite step, not solved here.
- `--forceExit` needed: Kafka/RabbitMQ client handles don't fully release
  on `app.close()`, so Jest hangs after the suite passes without it. Root
  cause not chased further — flagged as a known rough edge, not a correctness
  issue (the assertions still run and pass before exit is forced).
- Test data is not fully cleaned up between runs: Content Service's own
  `ProcessedMessage` row for the RabbitMQ hop isn't deleted post-test (its
  key is minted inside AI Processing Service and never captured by the
  test), and `ModerationTrend` rows are left to accumulate like real
  production data rather than reset per run. Repeated runs add rows rather
  than starting clean — acceptable for now, revisit if it starts masking
  assertion bugs.
- Cross-app imports in `golden-path.integration.spec.ts` are a real,
  flagged deviation from this workspace's Nx boundary rules — acceptable
  because it's confined to test wiring in `apps/e2e-tests`, not product code.
