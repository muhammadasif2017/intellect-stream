# Reference Notes: Ingestion Pipeline (future milestone material)

Status: exploration doc only. Not merged into SPEC.md. Not current milestone.
Original milestone order (docker-compose → Nx scaffold → Content Service → API Gateway → AI Processing → Analytics → Notification → e2e) unchanged.

Captured here for later reference when we reach Content Service / AI Processing Service milestones — covers cron ingestion adapters, canonical schema, Redis dedup, RabbitMQ backpressure/DLQ, admin toggle, watchdog dead-man's-switch.

---

## Core Architecture Overview
Distributed microservice ecosystem: NestJS, RabbitMQ (broker), Redis (cache/dedup).

```
[External Sources] -> [Ingestion Gateway / Adapters]
                            |
                     (Every 15 Mins)
                            |
                    [Redis Deduplication]
                            |
                   [RabbitMQ Prefetch: 5]
                            |
                    [AI Processor Service] -> [Cloudflare Workers AI]
```

## Ingestion Tier & Source Abstraction (Adapter Pattern)
- Cron cadence: `@Cron(CronExpression.EVERY_15_MINUTES)`
- Ingestion Gateway isolates core pipeline from platform-specific payloads via `class-validator` unified schema
- Canonical schema (all sources map to this via `ContentAdapter` interface):

```typescript
export class CanonicalPostDto {
  internal_id: string;      // Generated UUIDv4
  source_name: string;      // e.g., 'REDDIT', 'MEDIUM', 'TWITTER'
  external_id: string;      // The unique ID from the host platform
  title: string;            // Cleaned string title
  body_content: string;     // Normalized plain-text content
  author_handle: string;    // Anonymized/Hashed user identifier
  created_at: Date;         // ISO Timestamp of creation
  metadata: Record<string, any>; // Flexible JSONB storage for source-specific footprints
}
```

Target ingestion behaviors:
- **Reddit Adapter**: target specific subreddits, fetch via `/new`, hard batch size 25/cycle, filter posts missing `selftext`
- **Medium Adapter**: parse public topic RSS/publication URLs, use `<pubDate>` to only capture articles from the last 15-min window

## Idempotency & Caching Strategy
- Dedup: check `external_id` against Redis Set (`processed_posts`) before processing
- TTL: 7-day expiry on dedup cache entries to prevent unbounded growth

## Adaptive Consumption & Backpressure (Cloudflare AI Alignment)
Target: stay within Cloudflare Workers AI free tier (300 req/min, 10k daily neurons).

- Concurrency: `noAck: false`, `prefetchCount: 5` — max 5 concurrent messages
- Rate-limit circuit breaking: on HTTP 429 from Cloudflare, NACK with `requeue: true`, pause consumer loop 5s
- DLQ: messages failing repeatedly (bad format, corruption, daily neuron ceiling hit) route to `content.moderation.dlq`, bypass infinite retry

## System Governance, Recovery & Fail-Safes
- Admin toggle: `POST /admin/ingestion/toggle` (`{ enabled: boolean }`), persisted to relational/doc DB, synced to Redis on bootstrap (survives restarts/redeploys)
- Dead Man's Switch (Watchdog):
  - Independent monitor checks system metrics (e.g., DB disk < 90%)
  - If nominal: writes heartbeat to Redis `SET ingestion_heartbeat "active" EX 60`
  - Ingestion cron checks for token at start of each cycle — if missing, halt and enter paused posture

## Downstream Kafka Hand-off (from same source discussion)
Full flow continues past the AI step:

```
[AI Processor Service] ◄──► [Cloudflare Workers AI]
     │  (Enriched with Sentiment & Tags)
     ▼
[Kafka Topic: post-moderated-events]
     │
     ├──► [Analytics Microservice] ──► Real-time Dashboard
     └──► [Storage Microservice]   ──► Persistent DB (PostgreSQL)
```

- AI Processor publishes canonical event to Kafka the moment moderation completes; task (RabbitMQ) becomes event (Kafka) at that boundary
- Multiple independent consumer groups read the same topic; retained log allows future services to replay history

**Conflict with current SPEC (do not adopt as-is):**
- "Storage Microservice" writing posts from Kafka violates Decision 5 (Content Service is sole writer to posts table). If ingestion is added, ingested content routes into Content Service instead.
- This design is moderate-then-store; SPEC is store-then-moderate (outbox). Correct for scraped content, wrong for user-created posts — keep flows separate if both ever exist.
- 429 handling here (NACK requeue + 5s in-process pause) is inferior to Decision 10's TTL-based delayed retry queues; keep the Cloudflare limits (300 req/min, 10k neurons/day) but use the SPEC retry mechanism.
- Source discussion assumed Zookeeper; workspace is on KRaft.

## Code-gen instructions (from source spec, for later use)
- NestJS snippets using `@nestjs/microservices`, `@nestjs/schedule`, `ioredis`
- Explicit `channel.ack()` / `channel.nack()` error handling
- TypeScript types/interfaces prioritized, clean/scannable
