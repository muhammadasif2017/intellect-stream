# ADR-0006: Unified message envelope and relay routing by event type

## Status
Accepted

## Date
2026-07-07

## Context
Every message crossing a broker needs to support three system-wide mechanisms: consumer-side deduplication (at-least-once delivery, ADR-0002), end-to-end tracing (correlation IDs, SPEC decision 8), and contract evolution (additive-only DTOs, SPEC decision 9). Separately, one outbox table must feed two brokers — moderation jobs to RabbitMQ, domain events to Kafka — so the relay needs a routing rule.

## Decision

**Envelope** — every message, both brokers, defined once in `shared-dtos`:

```typescript
interface MessageEnvelope<T> {
  messageId: string;      // UUID = outbox row ID; the dedupe key
  correlationId: string;  // propagated from the originating request
  eventType: string;      // namespaced, e.g. 'content.post.created'
  eventVersion: number;   // starts at 1; additive changes don't bump it
  occurredAt: string;     // ISO-8601, set at outbox-write time
  source: string;         // producing service name
  payload: T;
}
```

`occurredAt` is write-time, not publish-time — relay lag must never distort event timestamps.

**Routing** — the relay maps `eventType → destination` in configuration. An unmapped eventType is a hard failure (log + row stays pending), never a silent drop.

## Alternatives Considered

### Destination column on the outbox row
- Pros: explicit per row; no mapping to maintain.
- Cons: bakes a routing concern into data. Breaks when one event needs two destinations — duplicating rows would mint two messageIds for a single fact, corrupting dedupe.
- Rejected: `post.created` will eventually fan out to both brokers.

### No envelope (bare payloads)
- Pros: less ceremony.
- Cons: dedupe, tracing, and versioning would each need ad-hoc reinvention per message type; retrofitting a wrapper later touches every contract simultaneously.
- Rejected: the envelope costs six fields once; its absence costs a coordinated system-wide change later.

## Consequences
- `shared-dtos` gains its first real export; all consumers validate the envelope at the boundary (class-validator), same rigor as REST DTOs.
- Milestone 3 implements the RabbitMQ publisher only, behind a `Publisher` interface; the Kafka publisher slots into the same seam at milestone 6.
- Deep rationale: `docs/interview-questions.md`, questions 2, 8, 9.
