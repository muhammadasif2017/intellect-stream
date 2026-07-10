# IntellectStream

AI-powered content moderation and analytics platform: users post content, a background pipeline moderates it with an AI model, and results flow into live analytics and real-time notifications.

**What this is:** a from-scratch distributed system, not a tutorial clone. Primary goal is depth over speed — every architectural decision is written down and defensible in a senior-level interview (see [SPEC.md](./SPEC.md) and [docs/decisions/](./docs/decisions/)); the working system is the secondary output.

**What it showcases:**
- Event-driven microservices with two brokers used for what each is good at — RabbitMQ for work queues (ack/retry/DLQ), Kafka for a replayable event log ([ADR-0001](./docs/decisions/ADR-0001-rabbitmq-for-jobs-kafka-for-events.md))
- Transactional outbox + polling relay for exactly-once-effect delivery out of Postgres ([ADR-0002](./docs/decisions/ADR-0002-transactional-outbox-with-polling-relay.md))
- At-least-once consumers made idempotent via dedupe tables, not broker tricks
- Database-per-service boundaries, services talk only via REST + events ([ADR-0004](./docs/decisions/ADR-0004-database-per-service.md))
- Shared message envelope/contracts across services ([ADR-0006](./docs/decisions/ADR-0006-message-envelope-and-relay-routing.md))
- Signed internal auth tokens between gateway and internal services ([ADR-0007](./docs/decisions/ADR-0007-session-auth-with-signed-internal-tokens.md))
- Redis fixed-window rate limiting ([ADR-0008](./docs/decisions/ADR-0008-fixed-window-redis-rate-limit.md))

**Flow:** post created → moderation job queued (outbox → RabbitMQ) → Cloudflare Workers AI verdict → result event → analytics aggregated (Kafka) → user notified (WebSocket).

## Quick Start

```sh
pnpm install
cp .env.example .env          # local defaults match docker-compose
docker compose up -d           # Redis, RabbitMQ, Kafka (KRaft), Postgres — wait for healthy
pnpm db:generate               # generate Prisma client (content-service)
pnpm db:generate:gateway       # ...and api-gateway
pnpm db:generate:analytics     # ...and analytics-service — each service owns its DB (ADR-0004)
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

## Architecture

Patterns above cover the cross-cutting decisions. Service-specific ones:

- **Analytics:** Kafka publisher/topic design and trend persistence model. [ADR-0009](./docs/decisions/ADR-0009-kafka-publisher-and-topic-design.md), [ADR-0010](./docs/decisions/ADR-0010-analytics-persistence.md)

Full decision index with trade-offs and rejected alternatives: [SPEC.md → Decisions Log](./SPEC.md). Interview-ready deep dives: [docs/interview-questions.md](./docs/interview-questions.md).

## Project Status

Milestones 1–5 complete (infra, workspace, Content Service, API Gateway, AI Processing Service). Milestone 6 in progress (Analytics Service: persistence model and Kafka publisher wired; consumer wiring next). Milestone 7 (Notification Service) and 8 (e2e wiring) not started. Roadmap in [SPEC.md](./SPEC.md).
