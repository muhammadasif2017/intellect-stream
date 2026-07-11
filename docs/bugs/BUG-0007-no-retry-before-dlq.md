# BUG-0007: First consumer failure goes straight to DLQ — no retry

**Found:** 2026-07-11, architecture review of `shared-messaging`
**Status:** Open

## Symptom (anticipated, not observed)

`RabbitMqConsumer.handleMessage()` handles any handler error with:

```ts
channel.nack(msg, false, false); // requeue = false → dead-letters immediately
```

Combined with the topology from `assertQueueTopology()` (queue's DLX routes to
`<queue>.dlq`), a **single** failed handling attempt sends the message to the
DLQ. There is no retry of any kind.

Failure mode: a transient fault — Postgres briefly unreachable, a lock
timeout, a momentary network blip to Cloudflare Workers AI — kills the message
permanently. Per decision 10, DLQ recovery is manual (log + alert, human
replays), so every transient hiccup during message handling becomes a human
task, and until someone replays it, the post sits unmoderated.

This contradicts what the architecture claims about itself. SPEC's tech-stack
line promises "work-queue semantics, **retry**/DLQ", and ADR-0001 picked
RabbitMQ for exactly these work-queue semantics — but the retry half was never
built. The DLQ, designed as the terminal destination for *poison* messages,
currently receives every *transiently unlucky* message too.

## Root cause

`nack(requeue: false)` was written as the simplest correct-looking failure
path, and nothing in the topology distinguishes "failed, worth retrying" from
"failed, will never succeed". Same conflation as BUG-0006 one layer over —
there the outbox relay couldn't tell retryable from poison rows; here the
consumer can't tell retryable from poison messages. BUG-0006 fixed it with an
attempt counter + quarantine; the messaging layer needs its own equivalent.

Naive alternatives don't work, which is why this needs topology, not a flag:

- `nack(requeue: true)` — redelivers immediately and forever: a hot loop on a
  persistent fault, no attempt count (RabbitMQ's `redelivered` flag is a
  boolean, it can't count to N).
- In-handler sleep/retry — blocks the consumer's prefetch window and loses all
  retry state on process restart.

## Fix (chosen design)

TTL retry-queue cycle — no new infra, only queue topology (stays inside the
SPEC boundary; the delayed-message exchange plugin was rejected for being a
new infra piece):

```
<queue>  --nack-->  <queue>.retry  --TTL expires-->  back to <queue>
   │                (no consumer,                      x-death count grows
   │                 message TTL ~15s)                 by one per cycle
   └── handler checks x-death count ≥ MAX_DELIVERIES (5):
       publish copy to <queue>.dlq + ack  → terminal, decision 10 applies
```

Changes, all in `shared-messaging`:

1. `assertQueueTopology()` declares `<queue>.retry` with `messageTtl` and a
   DLX pointing back to `<queue>`; the main queue's DLX now points to
   `<queue>.retry` instead of `<queue>.dlq`.
2. `handleMessage()` reads the `x-death` header count before invoking the
   handler; at/over `MAX_DELIVERIES` it publishes the message to `<queue>.dlq`
   and acks — the DLQ becomes poison-only, as decision 10 intended.
3. `MAX_DELIVERIES` and retry TTL live next to the topology so every
   publisher/consumer pair agrees (same single-declaration-site rule the
   topology comment already enforces for queue arguments).

Trade-off accepted: retry delay is fixed (one TTL), not exponential —
per-message backoff needs either multiple retry queues or the plugin, neither
worth it at this scale. Revisit if real traffic shows thundering-herd retries.

## Deployment gotcha

RabbitMQ rejects redeclaring a queue with different arguments
(406 PRECONDITION-FAILED) — the exact trap the `queue-topology.ts` comment
documents. Changing the main queue's DLX argument therefore requires deleting
the existing queues in dev (`rabbitmqctl delete_queue` or management UI)
before services restart. Messages in flight are lost — acceptable in dev;
a production system would need a blue/green queue migration.

## Prevention

When a design doc names a pattern ("retry/DLQ"), check the implementation
delivers both halves before calling the milestone done — a DLQ without retry
is just a slow message deleter. And any failure path that can't count
attempts should be treated as suspect by default: booleans (`redelivered`,
`requeue`) can't distinguish transient from permanent failure.
