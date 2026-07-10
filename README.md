# IntellectStream

AI-powered content moderation and analytics platform, built as an event-driven microservice system. A learning project: every architectural decision is recorded and defensible (see [SPEC.md](./SPEC.md) and [docs/decisions/](./docs/decisions/)).

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

- **Commands vs facts:** moderation jobs ride RabbitMQ (work queue: ack/retry/DLQ); domain events ride Kafka (retained, replayable log). [ADR-0001](./docs/decisions/ADR-0001-rabbitmq-for-jobs-kafka-for-events.md)
- **Consistency:** transactional outbox + polling relay; at-least-once delivery with idempotent consumers. [ADR-0002](./docs/decisions/ADR-0002-transactional-outbox-with-polling-relay.md)
- **Boundaries:** database per service, integration only via REST + events. [ADR-0004](./docs/decisions/ADR-0004-database-per-service.md)
- **Contracts:** every message wrapped in a shared envelope (messageId, correlationId, eventType/Version). [ADR-0006](./docs/decisions/ADR-0006-message-envelope-and-relay-routing.md)
- **Auth:** signed internal tokens carry identity from gateway to services; gateway holds the session. [ADR-0007](./docs/decisions/ADR-0007-session-auth-with-signed-internal-tokens.md)
- **Rate limiting:** fixed-window counter in Redis, keyed by IP. [ADR-0008](./docs/decisions/ADR-0008-fixed-window-redis-rate-limit.md)
- **Analytics:** Kafka publisher/topic design and trend persistence model. [ADR-0009](./docs/decisions/ADR-0009-kafka-publisher-and-topic-design.md), [ADR-0010](./docs/decisions/ADR-0010-analytics-persistence.md)

Decision index with trade-offs: [SPEC.md → Decisions Log](./SPEC.md). Interview-ready deep dives: [docs/interview-questions.md](./docs/interview-questions.md).

## Project Status

Milestones 1–5 complete (infra, workspace, Content Service, API Gateway, AI Processing Service). Milestone 6 in progress (Analytics Service: persistence model and Kafka publisher wired; consumer wiring next). Milestone 7 (Notification Service) and 8 (e2e wiring) not started. Roadmap in [SPEC.md](./SPEC.md).
