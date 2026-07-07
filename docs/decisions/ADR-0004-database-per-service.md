# ADR-0004: Database per service, no shared database

## Status
Accepted

## Date
2026-07-07

## Context
Five services need persistence over time. The cheapest path — one Postgres instance, shared tables — silently turns every table schema into an unversioned public API: services couple at the schema level, migrations require lockstep deploys, business invariants can be bypassed by direct writes, and one service's query load degrades another's.

## Decision
Each service owns its database exclusively. Cross-service data access happens only through published contracts: REST APIs and events. First concrete instance: `content_db`, owned by the Content Service, which is the **sole writer** to the posts table — even the moderation verdict produced by the AI service arrives as an event that the Content Service applies to its own rows (SPEC decision 5, provisional until milestone 5).

## Alternatives Considered

### Shared database
- Pros: cross-service joins, ACID transactions across domains, one instance to operate.
- Cons: schema coupling, lockstep migrations, invariant bypass, noisy-neighbor load.
- Rejected: defeats the purpose of service boundaries.

### Shared instance, separate schemas/databases
- Pros: operational simplicity of one Postgres server with logical isolation.
- Cons: acceptable compromise operationally, but shared failure domain and temptation to cross schemas.
- Partially adopted: in local dev, one Postgres *container* hosts service databases (currently only `content_db`); the isolation is logical. Production-grade separation would use separate instances. The rule that matters — no service touches another's tables — is absolute either way.

## Consequences
- No cross-service joins or transactions; other services build read models by consuming events, accepting eventual consistency.
- Each new service that needs storage gets its own database added to compose (named for the owning service).
- Deep rationale: `docs/interview-questions.md`, questions 5 and 6.
