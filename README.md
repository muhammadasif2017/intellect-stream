# IntellectStream

AI-powered content moderation and analytics platform: users post content, a background pipeline moderates it with an AI model, and results flow into live analytics and real-time notifications.

**What this is:** a from-scratch distributed system, not a tutorial clone. Primary goal is depth over speed — every architectural decision is written down and defensible in a senior-level interview; the working system is the secondary output.

**What it showcases:**
- Event-driven microservices with two brokers used for what each is good at — RabbitMQ for work queues (ack/retry/DLQ), Kafka for a replayable event log
- Transactional outbox + polling relay for exactly-once-effect delivery out of Postgres
- At-least-once consumers made idempotent via dedupe tables, not broker tricks
- Database-per-service boundaries, services talk only via REST + events
- Shared message envelope/contracts across services
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
   │ REST
   ▼
┌─────────────────┐  session cookie + Redis rate-limit
│   api-gateway    │  issues a signed internal token per request
│     :3000        │
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
        │ analytics-service │    │ notification-service  │
        │      :3003        │    │       :3004            │
        │ consumes event,   │    │ consumes event, pushes │
        │ aggregates trends │    │ to user over WebSocket │
        │ into own Postgres │    │                         │
        └──────────────────┘    └──────────────────────┘
```

Design notes:
- Every consumer is at-least-once (broker redelivers on crash/timeout mid-processing), so every consumer checks a `ProcessedMessage` dedupe table before acting — idempotency lives in the service, not the broker.
- Every message on the wire is wrapped in a shared envelope (`messageId`, `correlationId`, `eventType`, `eventVersion`), so a consumer can dedupe, trace, and version-check without touching the payload shape.
- Each service owns its own Postgres database; nothing reaches across a service boundary except REST calls and broker messages — no shared tables, no foreign keys across services.
- The outbox write and the domain write happen in the same DB transaction, so the relay can never publish an event for a post that failed to save (or vice versa).

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

Milestones 1–5 complete (infra, workspace, Content Service, API Gateway, AI Processing Service). Milestone 6 in progress (Analytics Service: persistence model and Kafka publisher wired; consumer wiring next). Milestone 7 (Notification Service) and 8 (e2e wiring) not started.
