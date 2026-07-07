# ADR-0002: Transactional outbox with a polling relay

## Status
Accepted

## Date
2026-07-07

## Context
When the Content Service creates a post it must (a) insert the row in Postgres and (b) announce the fact to a message broker. No transaction spans both systems; a crash between the two steps either strands an unmoderated post (DB-first) or moderates a nonexistent post (publish-first). This is the dual-write problem.

## Decision
Write the outgoing message into an `outbox` table **inside the same database transaction** as the business change. A separate polling relay reads pending outbox rows, publishes them, and marks them sent. Delivery guarantee becomes at-least-once; duplicates are neutralized by idempotent consumers keyed on the outbox row UUID (SPEC decision 6).

## Alternatives Considered

### Publish directly, no outbox
- Pros: simplest code.
- Cons: dual-write problem unsolved; lost or phantom events under crash.
- Rejected: correctness, not style.

### Change Data Capture (Debezium + Kafka Connect)
- Pros: lower publish latency; no polling load; battle-tested at scale.
- Cons: two significant new infrastructure pieces to deploy, configure, and operate.
- Rejected for now: at this project's scale, poll-interval latency is irrelevant for moderation jobs; polling is understandable end-to-end, which serves the learning goal. CDC is the known upgrade path.

### Event sourcing
- Pros: log is the source of truth; audit for free.
- Cons: wholesale change of persistence model, far beyond what the consistency problem requires.
- Rejected: disproportionate.

## Consequences
- At-least-once delivery is now a system-wide contract: **every consumer must be idempotent** (unique constraint on message ID for DB writers, Redis SETNX for stateless steps).
- The relay is a single point to monitor: a stuck relay = silent event stoppage; needs a pending-row-age metric eventually.
- One outbox table feeds two brokers — routing handled per ADR-0006.
- Deep rationale: `docs/interview-questions.md`, questions 2, 3, 9.
