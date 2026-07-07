# ADR-0001: RabbitMQ for processing jobs, Kafka for domain events

## Status
Accepted

## Date
2026-07-07

## Context
The system has two fundamentally different messaging workloads:

1. **AI moderation jobs** — commands that must each be processed once by one worker, can fail individually (external Cloudflare Workers AI call: timeouts, rate limits, malformed content), take seconds each, and need bounded retries with a dead-letter destination.
2. **Analytics/domain events** — facts that multiple independent consumers (Analytics, Notification, future services) must read at their own pace, with history retained for replay.

A single broker for both would force one workload into a model designed for the other.

## Decision
RabbitMQ carries the job path (work-queue semantics); Kafka carries the event path (retained, replayable log). Rule of thumb: **commands go to a queue; facts go to a log.**

## Alternatives Considered

### Kafka for everything
- Pros: one broker to operate; consumer groups scale reads.
- Cons: no per-message acknowledgment (single offset per partition → head-of-line blocking on a failed job); no native DLQ/retry (must hand-build retry-topic chains); consumer parallelism capped by partition count; long-running jobs fight `max.poll.interval.ms` and trigger rebalances.
- Rejected: every RabbitMQ strength the job path needs would have to be rebuilt by hand.
- Note (2026): Kafka 4.0 share groups (KIP-932) add per-message-ack semantics, but are early-access and still lack RabbitMQ's mature retry/DLQ tooling. Does not change this decision today; revisit if share groups mature.

### RabbitMQ for everything
- Pros: one broker; excellent routing.
- Cons: messages deleted on ack — no retention, no replay, no multiple independent readers of the same stream without duplicating queues.
- Rejected: the analytics path's core requirements (replay, fan-out to independent consumers) are exactly what RabbitMQ deletes.

## Consequences
- Two brokers to run and learn — accepted cost; the contrast is itself a learning objective of this project.
- The moderation result crosses from the job world to the event world: the AI service consumes from RabbitMQ and publishes results toward Kafka/consumers (see SPEC decision 5).
- Deep rationale and interview framing: `docs/interview-questions.md`, question 1.
