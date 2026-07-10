# ADR-0010: Analytics persistence — Postgres, own database, rollup read-model

## Status
Accepted

## Date
2026-07-09

## Context
SPEC's Open Architectural Questions left analytics persistence undecided
between three options: Redis, Postgres (own DB), or in-memory with
replay-on-restart. Analytics-service consumes `moderation.completed` facts
from Kafka (ADR-0009) and needs to answer trend queries — counts of
moderation verdicts by category over time.

## Decision
**Postgres, own database (`analytics_db`), following the database-per-service
pattern (ADR-0004)** — same shared Postgres container, new logical database,
own Prisma schema/config, same as content-service and api-gateway.

Two tables:

```prisma
model ModerationTrend {
  id        String   @id @default(uuid())
  date      DateTime @db.Date
  category  String
  verdict   String
  count     Int      @default(0)

  @@unique([date, category, verdict])
}

model ProcessedMessage {
  messageId   String   @id
  processedAt DateTime @default(now())
}
```

Each consumed Kafka message is handled in one transaction: insert into
`ProcessedMessage` (unique constraint on `messageId` — a duplicate delivery
hits a constraint violation and is treated as already-processed, same
dedupe pattern content-service already uses per SPEC decision 6), then
`upsert` the matching `ModerationTrend` row, incrementing `count`. This is a
materialized read-model built entirely from the Kafka stream.

Steady-state, the consumer resumes from its committed offset
(`fromBeginning: false`) — replaying the whole topic on every restart would
reprocess history it's already dedupe-safe against, for no benefit. "Rebuild
from the stream" is a deliberate, manual recovery operation (truncate both
tables, reset the consumer group's offsets to 0 or start a fresh group id),
not something that happens implicitly on restart — same "log + alert, manual
action" posture as decision 10's RabbitMQ DLQ replay, not an automated
retention/replay pipeline.

`KafkaConsumer` only catches and skips malformed-JSON messages (unrecoverable
regardless of retry); everything else — including `TrendsService`'s own
transient-failure rethrow — propagates to kafkajs, which retries rather than
auto-committing the offset. That's what makes the at-least-once + dedupe
story above actually hold for real failures, not just the happy path.

## Alternatives Considered

### Redis (counters, e.g. `HINCRBY`/sorted sets per time bucket)
- Pros: fastest writes, already provisioned for rate-limiting/sessions, no
  new infra.
- Cons: durability is a secondary concern for Redis by default (would need
  AOF tuning to match Postgres's guarantees for data that must not be lost);
  time-bucketed trend queries need careful key design (one sorted set per
  day/category) rather than falling out of a normal `WHERE`/`GROUP BY`;
  weaker fit for the "explain your query" interview story than SQL rollups.
- Rejected: better fit for ephemeral/real-time counters than durable
  analytics facts, and this project already uses Redis for that different
  purpose (rate-limit, session) — reusing it here would blur why each store
  exists.

### In-memory, replay Kafka from offset 0 on every restart
- Pros: zero persistence code, trivially "correct" (state is always a pure
  function of the topic).
- Cons: full topic replay on every restart, growing without bound as the
  topic accumulates history; no benefit over a materialized table once the
  topic has more than a trivial amount of data; doesn't demonstrate the
  materialized-read-model pattern the project's stated CQRS-adjacent goal
  calls for.
- Rejected: acceptable only at a toy data volume; doesn't scale as a design,
  even for a learning project meant to defend its choices.

## Consequences
- Sixth service to persist to the shared Postgres container:
  `docker/postgres-init/02-analytics-db.sh` added alongside the existing
  content/gateway init scripts (ADR-0004's established pattern).
- Analytics-service is a pure consumer of its own store — nothing else
  writes to `analytics_db`, consistent with "no service touches another's
  tables."
- The trend table is disposable by design: correctness lives in the Kafka
  topic + dedupe table, not in the rollup being hand-maintained.
- Deep rationale: `docs/interview-questions.md` (to be extended with a
  milestone-6 question per SPEC's boundary).
