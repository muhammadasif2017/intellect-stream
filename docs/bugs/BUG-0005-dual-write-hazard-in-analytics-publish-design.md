# BUG-0005: Dual-write hazard in first-draft Analytics publish design

**Found:** 2026-07-09, design review for milestone 6 (Analytics Service), before any code was written
**Status:** Avoided — caught in design review, never implemented

## Symptom (anticipated, not observed)

First-draft design: `ai-processing-service`'s `ModerationConsumerService` publishes
`moderation.completed` to RabbitMQ (existing, for content-service) and *also*
directly to Kafka (new, for analytics-service), from the same stateless handler,
with no transaction spanning the two publishes.

Failure mode: RabbitMQ publish succeeds, Kafka publish fails (broker hiccup,
network blip, topic not yet provisioned). Content-service updates the post's
moderation status; analytics-service never receives the event — no error
surfaces anywhere, since the RabbitMQ leg reported success. On manual DLQ
replay of the RabbitMQ message, the handler mints a fresh `randomUUID()` for
`messageId`, so a retry produces a *different* id than the original attempt —
defeats the decision-6 dedupe mechanism the retry was relying on.

## Root cause

Publishing the same fact to two brokers from a stateless handler is a
dual-write: no atomicity between the two operations, and no shared identity
(`messageId`) across broker boundaries for a retry to dedupe against. This is
exactly the failure category the outbox pattern (decision 7) exists to
prevent for the DB→broker case; publishing straight from a stateless consumer
to two brokers reintroduces the same hazard one layer over, with no outbox to
catch it.

It also bypasses the seam decision 14 was written to leave open: `RELAY_ROUTING`
+ the `Publisher` interface, specifically so a second broker slots into the
*existing* outbox/relay machinery rather than a new ad-hoc publish path.

## Fix (design chosen instead)

Route the Kafka-bound analytics fact through content-service's outbox instead
of publishing it from ai-processing-service. Content-service already consumes
`moderation.completed` off RabbitMQ and updates the post row in a DB
transaction (commit eca690e) — extend that same transaction to also insert an
outbox row for the domain fact, carrying forward the original `correlationId`.
The outbox relay (already at-least-once + dedupe-safe per decisions 6/7) routes
it to Kafka. Analytics-service dedupes on that outbox-minted `messageId`, same
`ProcessedMessage` pattern content-service itself uses.

See [ADR-0009](../decisions/ADR-0009-kafka-publisher-and-topic-design.md) for
the full decision and the `RELAY_ROUTING` extension (destination becomes
broker-aware) that this requires.

## Prevention

When a fact needs to reach a second broker/consumer, check whether it already
flows through an outbox first. If yes, extend the outbox row/relay routing
rather than adding a second publish call at the point of origin — the outbox
is the only place in this system with transactional identity to anchor a
`messageId` against for safe retries.
