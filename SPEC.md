# Spec: intellect-stream — AI-Powered Content Moderation & Analytics Platform

## Objective
Learning-focused microservices build. Primary user = engineer (3 YOE, first microservice project).
Success = can explain and defend every architectural decision in a senior-level interview, not just ship working code.
Secondary output = working distributed system demonstrating event-driven patterns, CQRS-adjacent flows, idempotency, outbox pattern.

## Tech Stack
- NestJS (latest stable), TypeScript strict mode
- Nx monorepo (shared libs for DTOs/contracts)
- Redis (rate-limiting, session tracking, caching)
- RabbitMQ (task queue: AI processing jobs — work-queue semantics, retry/DLQ)
- Apache Kafka in KRaft mode (event stream: analytics, high-throughput trend data)
- Cloudflare Workers AI (text/image moderation inference, external HTTP call from AI Processing Service)
- Postgres (Content Service persistence)
- pnpm, Jest, Docker Compose (local dev)

## Services
1. **API Gateway** — NestJS REST, Redis rate-limit + session
2. **Content Service** — CRUD for posts, publishes domain events (outbox pattern → Kafka/RabbitMQ)
3. **AI Processing Service** — RabbitMQ consumer, calls Cloudflare Workers AI, publishes moderation result
4. **Analytics Service** — Kafka consumer, aggregates trends
5. **Notification Service** — WebSocket gateway, real-time user alerts

## Commands
- Dev infra: `docker-compose up -d`
- Per-service dev: `nx serve <service-name>`
- Test: `nx test <service-name>`
- Lint: `nx lint <service-name>`
- Build all: `nx run-many -t build`

## Project Structure
```
intellect-stream/
  apps/
    api-gateway/
    content-service/
    ai-processing-service/
    analytics-service/
    notification-service/
  libs/
    shared-dtos/       → cross-service message contracts
    shared-config/      → env schema, common config module
    shared-messaging/   → RabbitMQ + Kafka publisher/consumer wrappers
    shared-redis/       → Redis client module
  docker-compose.yml
  SPEC.md
```

## Code Style
- Strict TS, no `any` without justification comment
- NestJS conventions: modules/controllers/services/DTOs separated, class-validator on all DTOs
- One responsibility per service boundary — no shared DB across services

## Testing Strategy
- Unit tests (Jest) per service for business logic
- Integration tests for message consumers/producers (using testcontainers or in-memory broker where feasible)
- No e2e cross-service tests in early milestones — added once 2+ services wired

## Boundaries
- **Always:** explain why before how; ask interview question after each milestone; wait for "Done"/"Proceed" before advancing
- **Ask first:** introducing new infra piece not in original blueprint (e.g., schema registry, k8s, service mesh)
- **Never:** write full service implementation for the engineer — engineer writes code, guide/review/quiz only

## Success Criteria
- Each milestone has a running, testable piece of infra/code
- Engineer can articulate trade-offs of every component added (asked explicitly per milestone)
- Final system: post created → moderation job queued → CF Workers AI evaluated → result stored → event streamed to Kafka → analytics updated → notification pushed via WebSocket

## Kafka Topic/Partition Strategy
- Decided at milestone 6 — see decision 17 / [ADR-0009](./docs/decisions/ADR-0009-kafka-publisher-and-topic-design.md). One topic per event type (`moderation-completed-events` first), partitioned by `postId`, 3 partitions, RF1, `KAFKA_AUTO_CREATE_TOPICS_ENABLE=false` with explicit provisioning (`pnpm kafka:provision-topics`).

## Decisions Log
Each entry: decision + trade-off accepted. Add one line per architectural decision as it's made.
Expensive-to-reverse decisions get a full ADR in `docs/decisions/` (context, alternatives, consequences); this log stays the one-line index.

> **Note on entries 4–10:** these are *provisional defaults*, logged ahead of their milestones. At each relevant milestone, re-derive the decision from first principles before opening this log — then confirm or overturn the entry. Overturning a provisional decision with a good reason is a stronger interview story than following all of them. Entries 1–3 and 11 are applied/confirmed.

1. **Dev DB = Postgres 16 container** (2026-07-07). Version-pinned, resettable, prod-parity image. Trade-off: data lost on `docker-compose down -v` — acceptable, migrations + seed scripts make recreation cheap and enforce good discipline.
2. **Kafka in KRaft mode, no Zookeeper** (2026-07-07). One less container, modern standard (Zookeeper removed in Kafka 4.0). Trade-off: none for single-node dev; multi-node quorum config differs from ZK-era docs.
3. **Distinct default ports per service** (2026-07-07): api-gateway 3000, content-service 3001, ai-processing-service 3002, analytics-service 3003, notification-service 3004. Overridable via `PORT` env; later centralize in `shared-config`.
4. **Gateway → Content Service transport = plain HTTP** (2026-07-07). Synchronous CRUD wants request/response; message broker adds latency + complexity with no benefit here. Trade-off: temporal coupling on read/write path — acceptable, that path is inherently synchronous.
5. **Moderation result flow = event, not shared write** (2026-07-07). AI Processing Service publishes `moderation.completed`; Content Service consumes it and updates its own row. Content Service is sole writer to posts table (both producer and consumer). Trade-off: eventual consistency between moderation verdict and post state — acceptable, UX tolerates seconds of lag.
6. **Idempotency mechanism** (2026-07-07). Outbox row UUID travels as message ID on every message; each consumer dedupes via unique constraint (DB consumers) or Redis SETNX (stateless consumers). Decided per consumer at build time, mechanism fixed now. *Confirmed at milestone 3.*
7. **Outbox relay = polling publisher** (2026-07-07), not CDC/Debezium. Simple, no extra infra. Trade-off: publish latency = poll interval, and at-least-once delivery (duplicates possible) — mitigated by decision 6. *Confirmed at milestone 3.*
8. **Correlation IDs from day one** (2026-07-07). Every message contract in `shared-dtos` carries `correlationId`, propagated gateway → content → outbox → RabbitMQ → AI → Kafka → analytics → WebSocket. Retrofit is painful; cost now is one field.
9. **Message contract validation at consumer boundary** (2026-07-07). class-validator runs on deserialized messages, same as REST DTOs. `shared-dtos` changes must be additive-only (no breaking field changes) to avoid lockstep deploys.
10. **DLQ terminal behavior = log + alert, manual replay** (2026-07-07). No automated replay in early milestones. Trade-off: dead jobs need human action — acceptable at learning/dev scale.
11. **Kafka auto-create topics: dev-only** (2026-07-07). Disable at Analytics milestone so topic/partition design is explicit, not defaulted.
12. **Data access = Prisma** (2026-07-07, milestone 3). Best-in-class generated types and migration DX; schema-file approach trades away NestJS decorator idiom. Outbox requirement (multi-statement transaction) served by `prisma.$transaction`.
13. **Message envelope** (2026-07-07, milestone 3): `{ messageId, correlationId, eventType, eventVersion, occurredAt, source, payload }`. `messageId` = outbox row UUID (serves decision 6); `occurredAt` set at outbox-write time, not publish time, so relay lag never distorts event timestamps. Defined once in `shared-dtos`.
14. **Relay routing = eventType→destination mapping in relay config** (2026-07-07, milestone 3), not a destination column. Destination is a routing concern, not a fact about the event; one event can fan out to both brokers without duplicating rows (which would mint two messageIds for one fact and corrupt dedupe). Unmapped eventType = hard failure (log + row stays pending), never silent drop. Milestone 3 builds RabbitMQ publisher only, behind a `Publisher` interface; Kafka publisher slots in at milestone 6.
15. **Auth transport/trust = session-cookie (Redis) at the edge, gateway-signed short-lived token downstream** (2026-07-08, milestone 4). Client↔gateway uses a Redis-backed session, not client-held JWT (revocation stays simple; Redis was already provisioned for this). Gateway↔downstream services use a per-request signed token so trust is verifiable, not implicit in network position. Full rationale: [ADR-0007](./docs/decisions/ADR-0007-session-auth-with-signed-internal-tokens.md). Does *not* resolve where identity itself is issued — see Open Architectural Questions.
16. **Rate limit = fixed-window Redis counter, keyed by IP** (2026-07-08, milestone 4). `INCR`+`PEXPIRE` per IP, 100 req/60s, global `APP_GUARD`, shares the session's Redis connection. Trade-off: up to 2x burst across a window boundary, and no per-route/per-user granularity — acceptable for a first pass. Full rationale: [ADR-0008](./docs/decisions/ADR-0008-fixed-window-redis-rate-limit.md).
17. **Kafka publisher + broker-aware relay routing** (2026-07-09, milestone 6). `moderation.completed` reaches Kafka via Content Service's outbox (new row in the same transaction that updates the post row), not a second publish call from AI Processing Service's stateless handler — a first-draft dual-publish design was caught in review and logged as [BUG-0005](./docs/bugs/BUG-0005-dual-write-hazard-in-analytics-publish-design.md). `RELAY_ROUTING` changed from `eventType → destination` to `eventType → {broker, destination}`; the relay picks the publisher from a small broker registry. Full rationale: [ADR-0009](./docs/decisions/ADR-0009-kafka-publisher-and-topic-design.md).
18. **Analytics persistence = Postgres, own database** (2026-07-09, milestone 6). `analytics_db`, same shared Postgres container (ADR-0004 pattern). Materialized rollup table (`ModerationTrend`, keyed by date/category/verdict) built from the Kafka topic, disposable by design; dedupe via `ProcessedMessage` on the outbox-minted `messageId`, same pattern Content Service uses on itself. Redis and in-memory-replay rejected — see alternatives in [ADR-0010](./docs/decisions/ADR-0010-analytics-persistence.md).
19. **User identity model = minimal users module inside api-gateway** (2026-07-10, milestone 4, unblocks milestone 7). Register/login, hashed passwords, token issue — reuses the gateway's existing session/Redis infra rather than standing up a separate service and DB to operate. Downstream services still consume identity only via gateway-forwarded claims (Decision 15, ADR-0007), so this choice doesn't change that contract, only where issuance lives. Trade-off: gateway grows a user-management concern beyond pure routing — acceptable at this scale; a dedicated identity service would buy isolation that isn't paying for itself yet.
20. **Notification Service feed = Kafka consumer group per instance, registry = in-memory** (2026-07-10, milestone 7). Reuses the existing `shared-messaging` `KafkaConsumer` and `moderation-completed-events` topic — each instance joins with its own unique `groupId`, so Kafka's normal per-group delivery gives every instance every event (broadcast), same trick already used to give Analytics Service its own group. No new infra piece introduced (Redis pub/sub broadcast layer rejected for that reason — SPEC boundary: ask first before adding infra not in the original blueprint, and this project runs single-instance today). `userId → socket` registry stays in-memory. Trade-off: breaks exactly as Q13 describes the moment a second instance runs — a user's socket can be on instance A while instance B's local registry lookup misses it. Logged as a known limitation, not solved now, same "acceptable at learning/dev scale" spirit as decision 10; fix if it's ever needed is a Redis-backed shared registry.
21. **WebSocket auth-on-connect = reuse gateway-signed internal token** (2026-07-10, milestone 7). No new auth mechanism: client, already session-authenticated at the gateway, calls a session-guarded gateway endpoint that mints a token via the existing `InternalTokenService` (ADR-0007, 60s TTL); client presents that token at the WS handshake to Notification Service, which verifies it once with the same shared-secret JWT check `InternalAuthGuard` already does for REST. 60s TTL is fine — the token only has to survive the handshake, not the connection's lifetime, same as a session cookie authenticates one request. Trade-off: no re-verification for the life of the socket (a revoked session doesn't force-close an open connection) — acceptable, matches this project's scale; forced disconnect-on-logout is a deferred feature, not a decided gap.
22. **Moderation-completed payload gains `authorId`** (2026-07-10, milestone 7). `Post.authorId` already exists in Content Service's schema and is already loaded when `moderation-completed-consumer.service.ts` updates the row — add it to the outbox payload that reaches Kafka (`shared-dtos`'s `ModerationCompletedPayload` gains an `authorId` field) so Notification Service can resolve which user's socket to push to. Same spirit as decision 8 (carry fields from day one instead of retrofitting): cheap now, and avoids Notification Service doing a synchronous lookup back to Content Service, which would reintroduce the coupling the event-driven design exists to avoid.
23. **Integration test approach = real docker-compose infra, not testcontainers; own `integration` nx target, not swept into `test`** (2026-07-10, milestone 8, accepted after review). Originally picked autonomously while the engineer was unavailable and logged as proposed pending review — accepted as-is. New `apps/e2e-tests` project, `jest.integration.config.ts`, run via `nx run e2e-tests:integration`. Two tests: a RabbitMQ publish/consume feasibility probe, and a golden-path test walking post → outbox → RabbitMQ → AI Processing (Cloudflare mocked) → RabbitMQ → Content Service → Kafka → Analytics Service + Notification Service, bootstrapping all four services' real `AppModule`s via cross-app imports flagged inline with `eslint-disable`. Full rationale, alternatives, and accepted trade-offs (`--forceExit`, unclean-ed-up test rows): [ADR-0011](./docs/decisions/ADR-0011-integration-test-approach.md).
24. **Messaging stays raw `amqplib`/`kafkajs` in `shared-messaging`, not `@nestjs/microservices`** (2026-07-11, post-milestone-8 review). `ClientProxy` publishes in-process at call time with no transactional-outbox concept — the relay's core requirement (one outbox row fanning out to two brokers, decisions 7/14/17) has no slot in that abstraction, so a raw publisher would still be needed underneath regardless. Custom envelope (decision 13) also doesn't map to Nest's `{pattern, data}` shape, and decision 20's per-instance unique `groupId` broadcast trick needs raw consumer-group control Nest's Kafka transporter doesn't expose cleanly. Gateway→Content HTTP (decision 4) unaffected — no microservices transporter benefits that sync path either. Trade-off accepted: more hand-rolled plumbing in `shared-messaging` than a framework-native app would have, in exchange for keeping the outbox/dedupe/dual-broker model intact. Left open, not required: swapping AI Processing Service's RabbitMQ consumer to Nest's RMQ transporter for declarative ack/nack/prefetch — isolated, low-stakes, not yet done.
25. **Outbox relay claims batches with `FOR UPDATE SKIP LOCKED`** (2026-07-11, post-review hardening, follows BUG-0006/0007 fixes). The relay's poll now runs inside a Prisma interactive transaction (30s timeout) whose raw claim query locks its batch — a second content-service instance, or the same instance's overlapping poll, skips claimed rows instead of double-publishing them. Trade-off accepted: broker I/O inside a DB transaction holds row locks for the batch's duration (bounded by batch size 20 + timeout), and a DB-level failure rolls back `publishedAt` marks so already-published rows redeliver — degrades to duplicate delivery, absorbed by consumer dedupe (decision 6), never loss. Removes the undocumented single-instance assumption the relay silently carried.

## Open Architectural Questions
Decisions still to be made, owned by the engineer at the stated milestone. Move each to the Decisions Log once resolved.

None open.

## Milestone Plan (high-level, ultra-incremental within each)
1. ✅ Docker Compose infra (Redis, RabbitMQ, Kafka in KRaft mode, Postgres)
2. ✅ Nx workspace scaffold + shared libs
3. ✅ Content Service (Postgres, CRUD, outbox pattern)
4. ✅ API Gateway (Redis rate-limit, routes to Content Service)
5. ✅ AI Processing Service (RabbitMQ consumer, Cloudflare Workers AI call)
6. ✅ Analytics Service (Kafka consumer, topic/partition design decided here)
7. ✅ Notification Service (WebSocket gateway)
8. ✅ End-to-end wiring + integration tests
