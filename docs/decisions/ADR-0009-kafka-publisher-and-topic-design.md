# ADR-0009: Kafka publisher, broker-aware relay routing, and topic design

## Status
Accepted

## Date
2026-07-09

## Context
Milestone 6 (Analytics Service) needs a second broker: the moderation verdict
(`postId`, `verdict`, `categories`) must reach Kafka as a fact for
analytics-service to aggregate, in addition to reaching content-service via
RabbitMQ (already built, commit eca690e) to update the post row. ADR-0006
anticipated exactly this — the `Publisher` interface and `eventType →
destination` relay routing exist specifically so "the Kafka publisher slots
into the same seam at milestone 6."

A first-draft design had `ai-processing-service` publish the verdict to both
RabbitMQ and Kafka directly from its stateless consumer handler. Design
review caught a dual-write hazard in that approach (no shared transaction, no
shared identity across the two publishes, a DLQ replay would mint a new
`messageId` for the RabbitMQ leg while Kafka never got any at all) — logged
as [BUG-0005](../bugs/BUG-0005-dual-write-hazard-in-analytics-publish-design.md).
This ADR documents the design used instead.

## Decision

**Route the Kafka fact through content-service's outbox, not a second publish
call at the point of origin.** Content-service already consumes
`moderation.completed` off RabbitMQ and updates the post row in one Prisma
transaction. That transaction gains one more statement: insert an outbox row
for the same fact, carrying forward the `correlationId` from the inbound
envelope. The existing outbox relay (at-least-once delivery, decision 6/7
dedupe) picks it up and routes it to Kafka — no new delivery-guarantee code
needed, the outbox already solved that problem once.

**`RELAY_ROUTING` becomes broker-aware.** Previously a flat
`Record<eventType, destinationString>`, interpreted entirely by whichever
single `Publisher` was bound to the `PUBLISHER` token. Now:

```typescript
type RelayRoute = { broker: 'rabbitmq' | 'kafka'; destination: string };
export const RELAY_ROUTING: Record<string, RelayRoute> = {
  [MODERATION_JOB_EVENT_TYPE]: { broker: 'rabbitmq', destination: MODERATION_JOB_QUEUE },
  [MODERATION_COMPLETED_EVENT_TYPE]: { broker: 'kafka', destination: MODERATION_COMPLETED_TOPIC },
};
```

`OutboxRelayService` resolves the publisher for a row from a small broker
registry (`Record<'rabbitmq' | 'kafka', Publisher>`) instead of a single
injected `PUBLISHER`. Both `RabbitMqPublisher` and the new `KafkaPublisher`
still implement the same `Publisher` interface (`publish(destination,
message)`) — the registry is the only new indirection, and it lives entirely
in the relay, not in any publisher implementation.

**Topic design**, made explicit per SPEC decision 11 rather than relying on
broker defaults:
- Topic: `moderation-completed-events` — one topic per event type (not a
  shared `analytics.events` catch-all), so a consumer never has to branch on
  eventType inside the topic; more topics get added as more event types
  reach Kafka.
- Partition key: `postId`. Preserves per-post ordering if a post is ever
  re-moderated; low value today (one verdict per post currently) but zero
  cost and standard practice.
- Partition count: 3. Enough to demonstrate partition/consumer-group
  mechanics and headroom for more than one analytics-service instance later;
  no throughput reason to go higher at dev scale.
- Replication factor: 1 — single-broker KRaft dev cluster (ADR-0003), no
  other replicas to hold a copy.
- `KAFKA_AUTO_CREATE_TOPICS_ENABLE` set to `false` in `docker-compose.yml`.
  The topic is created by an explicit provisioning script
  (`kafkajs` admin client), run as a deliberate step, not implied by the
  first consumer that happens to subscribe.

## Alternatives Considered

### Dual-publish from ai-processing-service (first draft)
- Pros: no change to `RELAY_ROUTING`/relay; analytics gets the event one hop
  sooner.
- Cons: dual-write with no shared transaction or identity across the two
  broker publishes — see BUG-0005.
- Rejected.

### Single `analytics.events` catch-all topic for all future event types
- Pros: fewer topics to provision.
- Cons: every consumer must filter/branch on `eventType`; partitioning
  strategy (keyed by `postId` here) may not fit every future event type
  equally.
- Rejected: one topic per event type costs nothing extra now and avoids a
  consumer-side filtering layer later.

### Leave `KAFKA_AUTO_CREATE_TOPICS_ENABLE` on
- Pros: zero provisioning code.
- Cons: partition count/replication become whatever the first producer's
  client defaults to, not a decision — directly contradicts SPEC decision 11
  ("disable at Analytics milestone so topic/partition design is explicit").
- Rejected.

## Consequences
- `Publisher` interface unchanged; `KafkaPublisher` is a second, independent
  implementation — no coupling to `RabbitMqPublisher`.
- `RELAY_ROUTING`'s type change is a breaking change to that file only; the
  existing `moderation.job` entry is updated in the same commit, not left on
  an old shape.
- Content-service's outbox now originates two eventTypes
  (`moderation.job`, `moderation.completed`) instead of one; `moderation.completed`
  as an outbox row is distinct from the RabbitMQ-consumed message of the same
  name — same eventType string because it is genuinely the same domain fact
  being relayed onward, but a new envelope with a new `messageId`, per
  ADR-0006's dedupe-key model.
- Analytics-service dedupes on that outbox-minted `messageId` via its own
  `ProcessedMessage` table (ADR-0010), mirroring content-service's existing
  pattern.
