# ADR-0013: Observability first pass — end-to-end correlation IDs in logs, JSON log format; metrics stack deferred

## Status
Accepted

## Date
2026-07-11

## Context
Decision 8 put `correlationId` on every message contract from day one so the
chain gateway → content → outbox → brokers → consumers could be traced. The
2026-07-11 architecture review found the promise half-kept: the id was minted
in Content Service (not the gateway, so the first hop wasn't covered), and
nothing ever *read* it — no failure log anywhere included it. Debugging a
stuck message meant grepping five services' logs by timestamp and guesswork.

The full observability answer (metrics endpoints, Prometheus/Grafana or an
OTel collector, Kafka consumer-lag tracking) involves new infra pieces, and
the SPEC boundary requires asking before adding those. This ADR is the
no-new-infra first pass: make the logs actually traceable, and make them
machine-parseable when something exists to parse them.

## Decision
**1. correlationId is minted at the edge and travels the whole chain.**
The gateway's `PostsProxyService` mints it per request, forwards it to
Content Service as an `x-correlation-id` header, and every gateway response
now returns that header to the client — a support ticket can quote an id
that matches every log line and message the request produced anywhere in the
system. Content Service uses the header for the outbox row (minting locally
only for callers that bypass the gateway, e.g. tests). Downstream
propagation already existed (envelope field, decision 13).

**2. Every messaging failure log carries messageId + correlationId.**
`RabbitMqConsumer` logs them on handler failure and on the exhausted→DLQ
route (best-effort parse there — that path also carries malformed bodies);
`KafkaConsumer` now catch-logs-rethrows handler errors with both ids —
kafkajs's own retry logging doesn't know the envelope exists. Rethrow
preserves the existing retry semantics exactly.

**3. `LOG_FORMAT=json` switches every service to Nest's built-in JSON
console logger** (`ConsoleLogger({ json: true })` at bootstrap). Default
stays human-readable for local dev. No logging library added — Nest 11's
built-in is enough until an aggregator exists to justify more.

## Deferred (needs the ask-first conversation, per SPEC boundary)
- **Metrics endpoints + scrape stack**: outbox depth (pending/quarantined),
  DLQ depths (`channel.checkQueue`), broker connection status, Kafka
  consumer lag (kafkajs admin API). The queries are cheap; the value is in
  the scraper/alerting stack (Prometheus + Grafana or hosted), which is new
  infra.
- **Tracing** (OpenTelemetry spans over the correlationId): the id now in
  every log gives 80% of the debugging value; spans add timing waterfalls
  at the cost of an OTel SDK + collector.

## Alternatives considered
- **pino / winston via `nestjs-pino`**: better throughput and real
  structured fields instead of formatted strings — but a dependency swap
  across five services for a system whose log volume is developer-scale.
  Revisit when JSON logs are actually being shipped somewhere.
- **AsyncLocalStorage request context** (id auto-injected into every log
  line instead of manually included where it matters): the right shape at
  scale; here it's machinery serving five call sites. The manual approach
  keeps the mechanism visible — fitting for a learning codebase.
- **W3C `traceparent` instead of `x-correlation-id`**: right if OTel is the
  destination; premature while nothing consumes trace context. The header
  is one rename away.

## Consequences
- A stuck post is now diagnosable with one grep: the client-visible
  `x-correlation-id` appears in gateway, content, relay-published envelopes,
  and both brokers' consumer failure logs.
- `LOG_FORMAT=json` makes the docker-compose logs pipeable into `jq` today
  and into an aggregator later, without code changes.
- Cost carried: correlation ids are manually threaded (new endpoints that
  fan out asynchronously must remember to carry the header/envelope field);
  the frozen contract tests (ADR-0012) don't cover headers, so the
  `x-correlation-id` name is enforced only by the gateway/content pair's
  own tests.
