# BUG-0006: Outbox relay head-of-line blocking on permanently-pending rows

**Found:** 2026-07-11, architecture review of the outbox relay
**Status:** Open — latent defect, not yet observed in dev (requires stuck rows to accumulate)

## Symptom (anticipated, not observed)

`OutboxRelayService.poll()` selects its batch as:

```ts
const pending = await this.prisma.outboxMessage.findMany({
  where: { publishedAt: null },
  take: BATCH_SIZE, // 20
  orderBy: { occurredAt: 'asc' },
});
```

Two kinds of rows can stay `publishedAt: null` forever:

1. **Unroutable rows** — `RELAY_ROUTING[row.eventType]` is undefined. Decision 14
   makes this a hard failure on purpose: log + row stays pending, never silent
   drop. Correct as an alerting signal, but the row is *permanently* pending.
2. **Poison rows** — a row whose `publish()` throws on every attempt (payload
   the broker rejects, oversized message, serialization edge case). The catch
   block logs "will retry next poll" and leaves it pending — with no attempt
   counter, no backoff, no cap.

Because the batch is ordered `occurredAt: 'asc'` and stuck rows are by
definition the oldest, every stuck row occupies a batch slot on **every poll**.
Once 20 such rows accumulate, the batch consists entirely of stuck rows and
**no newer outbox message is ever published again**. The relay keeps polling,
keeps logging the same 20 errors, and looks alive — but the pipeline behind it
(RabbitMQ moderation jobs, Kafka analytics/notification events) has silently
stopped. Posts get created and never moderated.

## Root cause

The batch query has no way to distinguish "pending, worth retrying" from
"pending, will never succeed". `publishedAt: null` conflates both. Combined
with oldest-first ordering and a fixed batch size, permanently-failed rows
starve routable ones — classic head-of-line blocking.

The unmapped-eventType path (decision 14) chose "row stays pending" as the
failure mode without accounting for its interaction with the batch selector:
each such row doesn't just fail individually, it consumes relay throughput
forever.

## Fix (chosen design)

Add failure bookkeeping to `OutboxMessage` and exclude exhausted rows from the
batch:

- `attempts Int @default(0)` and `lastAttemptAt DateTime?` on the outbox row.
- Relay increments `attempts` on every failed publish **and** on every
  unroutable encounter.
- Batch query gains `attempts: { lt: MAX_ATTEMPTS }` — rows past the cap are
  quarantined: they stay in the table, visible and manually replayable
  (reset `attempts`), but no longer occupy batch slots.
- Quarantine crossing logs at `error` level once, mirroring the DLQ posture of
  decision 10: log + alert, manual replay, no automated resurrection.

This keeps decision 14's "never silent drop" guarantee — the row is still
there, still loud — while restoring liveness for everything behind it.

Optional hardening (not required for the fix): per-row backoff via
`lastAttemptAt`, so transient broker outages don't burn through `attempts`
in a few polls.

## Prevention

Any poller that selects work with "not done yet" semantics needs an answer to
"what if a row can *never* become done?" before it ships. If the failure
design says "leave it pending" (as decision 14's did), check what that does to
the work selector — a retained failed row must not compete with live work for
batch slots. Attempt counters + quarantine thresholds are the standard shape.
