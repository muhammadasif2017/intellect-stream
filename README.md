# IntellectStream

AI-powered content moderation and analytics platform: users post content, a background pipeline moderates it with an AI model, and results flow into live analytics and real-time notifications.

**What this is:** a from-scratch distributed system, not a tutorial clone. Primary goal is depth over speed — every architectural decision is written down and defensible in a senior-level interview; the working system is the secondary output.

**What it showcases:**
- Event-driven microservices with two brokers used for what each is good at — RabbitMQ for work queues (bounded retry via TTL cycle, then DLQ), Kafka for a replayable event log
- Transactional outbox + polling relay for exactly-once-effect delivery out of Postgres — multi-instance-safe (`FOR UPDATE SKIP LOCKED`) with poison-row quarantine
- At-least-once consumers made idempotent via dedupe tables, not broker tricks
- Broker-connection resilience: RabbitMQ reconnect with consumer replay; Kafka crash visibility
- Database-per-service boundaries, services talk only via REST + events
- Shared message envelope/contracts across services, additive-only evolution enforced by frozen-fixture compatibility tests in CI
- End-to-end correlation IDs: minted at the gateway, returned to the client, carried through outbox → brokers → every consumer's failure logs
- Signed internal auth tokens between gateway and internal services
- Redis fixed-window rate limiting

**Flow:** post created → moderation job queued (outbox → RabbitMQ) → Cloudflare Workers AI verdict → result event → analytics aggregated (Kafka) → user notified (WebSocket).

## Quick Start

```sh
pnpm install
cp .env.example .env          # local defaults match docker-compose
docker compose up -d           # Redis, RabbitMQ, Kafka (KRaft), Postgres — wait for healthy
pnpm db:generate               # generate Prisma client (content-service)
pnpm db:generate:gateway       # ...and api-gateway
pnpm db:generate:analytics     # ...and analytics-service — each service owns its DB
pnpm nx serve content-service  # or any other service
```

## Services

| Service | Port | Role |
|---|---|---|
| api-gateway | 3000 | REST entry, Redis rate-limit + session |
| content-service | 3001 | Posts CRUD, Postgres, outbox publisher |
| ai-processing-service | 3002 | RabbitMQ consumer → Cloudflare Workers AI |
| analytics-service | 3003 | Kafka consumer, trend aggregation |
| notification-service | 3004 | WebSocket gateway, real-time alerts |

Shared libs: `shared-dtos` (message contracts/envelope), `shared-config` (zod env validation), `shared-messaging` (RabbitMQ + Kafka publisher/consumer wrappers), `shared-redis` (Redis client module).

## Architecture

```
 client
   │ REST (post CRUD, login, "GET /auth/notifications-ticket")
   ▼
┌─────────────────┐  session cookie + Redis rate-limit
│   api-gateway    │  issues a signed internal token per request —
│     :3000        │  including a WS ticket for the client to use below
└────────┬─────────┘
         │ REST (token-authenticated)
         ▼
┌─────────────────┐   Postgres tx: INSERT Post + INSERT OutboxMessage
│ content-service  │───────────────┐         (same transaction, so a post
│     :3001        │               │          never exists without its event)
└──────────────────┘               ▼
                          ┌──────────────────┐
                          │  outbox relay     │  polls OutboxMessage,
                          │  (in-process)     │  routes by eventType →
                          └───┬──────────┬────┘  destination broker
                              ▼          ▼
                       ┌───────────┐ ┌───────────┐
                       │ RabbitMQ  │ │   Kafka   │
                       │ job queue │ │ event log │
                       │ ack/retry │ │ retained, │
                       │ /DLQ      │ │ replayable│
                       └─────┬─────┘ └─────┬─────┘
                             ▼              ▲
                  ┌────────────────────┐    │ moderation-result event
                  │ ai-processing-svc  │────┘
                  │       :3002        │
                  │ consumes job → calls│
                  │ Cloudflare Workers  │
                  │ AI → publishes      │
                  │ verdict             │
                  └─────────┬──────────┘
                             │ moderation-result event (Kafka)
                 ┌───────────┴────────────┐
                 ▼                        ▼
        ┌──────────────────┐    ┌──────────────────────┐
        │ analytics-service │    │ notification-service  │◄── client opens a
        │      :3003        │    │       :3004            │    WebSocket here
        │ consumes event,   │    │ verifies the ticket    │    directly (not
        │ aggregates trends │    │ once at handshake,     │    through the
        │ into own Postgres │    │ registers the socket   │    gateway),
        └──────────────────┘    │ in an in-memory         │    presenting the
                                 │ userId→socket registry, │    ticket minted
                                 │ pushes matching events  │    above
                                 └──────────────────────┘
```

Design notes:
- Every consumer is at-least-once (broker redelivers on crash/timeout mid-processing), so every consumer checks a `ProcessedMessage` dedupe table before acting — idempotency lives in the service, not the broker.
- Every message on the wire is wrapped in a shared envelope (`messageId`, `correlationId`, `eventType`, `eventVersion`), so a consumer can dedupe, trace, and version-check without touching the payload shape.
- Each service owns its own Postgres database; nothing reaches across a service boundary except REST calls and broker messages — no shared tables, no foreign keys across services.
- The outbox write and the domain write happen in the same DB transaction, so the relay can never publish an event for a post that failed to save (or vice versa).
- Notification Service holds no database and no session of its own — it trusts the same gateway-signed token every other internal call uses, verified once at the WebSocket handshake rather than per-request (a WS connection has no natural request/guard lifecycle to re-check on).
- Each Notification Service instance joins Kafka with its own unique consumer group, so a moderation event reaches every instance (not just one) — necessary because a user's socket only lives on whichever instance they happened to connect to.

## Commands

| Command | Description |
|---|---|
| `pnpm nx serve <service>` | Run one service in dev mode |
| `pnpm nx test <project>` | Unit tests for a project |
| `pnpm nx run-many -t lint test build` | Full CI target set locally |
| `pnpm db:generate[:gateway\|:analytics]` | Regenerate Prisma client (per service DB) |
| `pnpm db:migrate[:gateway\|:analytics]` | Create/apply a migration |
| `pnpm db:studio[:gateway\|:analytics]` | Browse the database |

Infra UIs: RabbitMQ management at `http://localhost:15672` (admin/admin, dev only).

## Project Status

All 8 milestones complete (infra, workspace, Content Service, API Gateway, AI Processing Service, Analytics Service, Notification Service, end-to-end wiring + integration tests). A real golden-path integration test (`apps/e2e-tests`) exercises the full flow — post → moderation → analytics + notification — against live docker-compose infra.

## Post-review hardening (2026-07-11)

A full architecture review after milestone 8 surfaced six operational gaps — the kind that separate a design exercise from a system that survives production weather. All six closed:

| Gap | Fix | Record |
|---|---|---|
| Stuck outbox rows starved the relay batch — pipeline could silently stop publishing | Attempt counter + quarantine threshold on `OutboxMessage`; quarantined rows stay in-table for manual replay | [BUG-0006](./docs/bugs/BUG-0006-outbox-relay-head-of-line-blocking.md) |
| First consumer failure went straight to DLQ — "retry/DLQ" had no retry | TTL retry-queue cycle (`x-death`-counted, 5 deliveries), DLQ becomes poison-only | [BUG-0007](./docs/bugs/BUG-0007-no-retry-before-dlq.md) |
| Broker connection drop left consumers as silent zombies | RabbitMQ reconnect loop with consumer replay; Kafka `CRASH`-event logging | SPEC decision 26 |
| Outbox relay double-published under >1 instance | Batch claim via `FOR UPDATE SKIP LOCKED` inside a transaction | SPEC decision 25 |
| Additive-only contract rule was honor-system | Frozen wire-payload fixtures fail CI on breaking DTO changes; `eventVersion` checked at all four consumer boundaries | [ADR-0012](./docs/decisions/ADR-0012-contract-compatibility-enforcement.md) |
| correlationId propagated but nothing consumed it | Minted at the gateway, echoed to the client, present in every messaging failure log; `LOG_FORMAT=json` for structured output | [ADR-0013](./docs/decisions/ADR-0013-observability-first-pass.md) |

Deliberately deferred (new infra, ask-first per SPEC): metrics endpoints + scrape stack, Kafka consumer-lag tracking, OpenTelemetry tracing — see ADR-0013's deferred section.
