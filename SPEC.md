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
- Deferred — decide at Analytics Service milestone, once event volume/consumer-group needs are concrete.

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

## Open Architectural Questions
Decisions still to be made, owned by the engineer at the stated milestone. Move each to the Decisions Log once resolved.

- **User identity model** (milestone 4, blocks milestone 7): auth *transport/trust* shape is decided (Decision 15, ADR-0007), but not where identity itself is issued. Spec has no Users service or user model, yet posts have authors and Notification Service needs a userId→socket mapping — milestone 7 cannot work without identity. Decide where the user concern lives: minimal users module inside the gateway (register/login, hashed passwords, token issue — smallest scope) vs dedicated identity service (another service to build and operate). Downstream services consume identity only via gateway-forwarded claims either way.
- Move compose credentials to `.env` references (milestone 4 cleanup item).
- **Analytics persistence** (milestone 6): where aggregates live — Redis, Postgres (own DB), or in-memory with replay-on-restart. Interacts with Kafka retention/replay decision.
- **Notification Service feed + socket registry** (milestone 7): which transport feeds it (Kafka consumer group per instance vs Redis pub/sub) and where userId→socket mapping lives. Interview doc Q13 describes a *proposed* design (Redis pub/sub broadcast) — it is not yet decided.

## Milestone Plan (high-level, ultra-incremental within each)
1. Docker Compose infra (Redis, RabbitMQ, Kafka in KRaft mode, Postgres)
2. Nx workspace scaffold + shared libs
3. Content Service (Postgres, CRUD, outbox pattern)
4. API Gateway (Redis rate-limit, routes to Content Service)
5. AI Processing Service (RabbitMQ consumer, Cloudflare Workers AI call)
6. Analytics Service (Kafka consumer, topic/partition design decided here)
7. Notification Service (WebSocket gateway)
8. End-to-end wiring + integration tests
