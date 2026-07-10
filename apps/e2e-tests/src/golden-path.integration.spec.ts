import 'dotenv/config';
import axios from 'axios';
import { NestFactory } from '@nestjs/core';

// Cloudflare Workers AI is a real, paid, third-party API with no
// configurable endpoint (cf-workers-ai.service.ts hardcodes
// api.cloudflare.com) — the one hop in this "real infra" golden-path test
// that gets mocked at the HTTP layer rather than hit for real. Every other
// hop (Postgres x2, RabbitMQ, Kafka) runs against the actual docker-compose
// stack. See SPEC.md's proposed milestone-8 testing-approach entry.
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Cross-app imports (reaching into another app's src, not a lib) — unusual
// for this workspace's Nx conventions, but this is a test-only reach for
// production DI wiring (AppModule), not a runtime dependency between
// services. Flagged in the proposed decision for engineer review.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { AppModule as ContentAppModule } from '../../content-service/src/app/app.module';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PostsService } from '../../content-service/src/app/posts/posts.service';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PrismaService as ContentPrismaService } from '../../content-service/src/app/prisma/prisma.service';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { AppModule as AiProcessingAppModule } from '../../ai-processing-service/src/app/app.module';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { AppModule as AnalyticsAppModule } from '../../analytics-service/src/app/app.module';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PrismaService as AnalyticsPrismaService } from '../../analytics-service/src/app/prisma/prisma.service';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { AppModule as NotificationAppModule } from '../../notification-service/src/app/app.module';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { SocketRegistryService } from '../../notification-service/src/app/registry/socket-registry.service';

async function waitFor<T>(
  fn: () => Promise<T | undefined | null>,
  { timeoutMs = 30000, intervalMs = 250 } = {},
): Promise<T> {
  const start = Date.now();
  let lastError: unknown;
  for (;;) {
    try {
      const result = await fn();
      if (result) {
        return result;
      }
    } catch (err) {
      // Retry on transient errors (e.g. a connection blip) same as a
      // not-ready-yet result — only surface it if we still haven't
      // succeeded once the timeout is actually exceeded.
      lastError = err;
    }
    if (Date.now() - start > timeoutMs) {
      const suffix = lastError ? `; last error: ${String(lastError)}` : '';
      throw new Error(`waitFor timed out after ${timeoutMs}ms${suffix}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('Golden path: post → moderation → analytics + notification (real infra)', () => {
  let contentApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let aiApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let analyticsApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let notificationApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

  beforeAll(async () => {
    // Cloudflare returns "unsafe\n<categories>" for a flagged post (Llama
    // Guard 3 8B format) — real parsing logic in CfWorkersAiService, only
    // the HTTP call itself is faked.
    mockedAxios.post.mockResolvedValue({
      data: { success: true, errors: [], result: { response: 'unsafe\nspam' } },
    });

    // Real production AppModules, real DI wiring, real infra connections —
    // just no HTTP listener (nothing here needs one).
    contentApp = await NestFactory.createApplicationContext(ContentAppModule, {
      logger: false,
    });
    aiApp = await NestFactory.createApplicationContext(AiProcessingAppModule, {
      logger: false,
    });
    analyticsApp = await NestFactory.createApplicationContext(AnalyticsAppModule, {
      logger: false,
    });
    notificationApp = await NestFactory.createApplicationContext(NotificationAppModule, {
      logger: false,
    });
  }, 60000);

  afterAll(async () => {
    await Promise.all([
      contentApp?.close(),
      aiApp?.close(),
      analyticsApp?.close(),
      notificationApp?.close(),
    ]);
  }, 30000);

  it(
    'flows a post through moderation to a persisted trend and a pushed notification',
    async () => {
      const authorId = `e2e-user-${Date.now()}`;

      // Pre-register a fake socket for this user — proves ModerationPushService
      // resolves the right recipient from the real event, without needing a
      // real socket.io client for this test.
      const fakeSocket = { emit: jest.fn() };
      notificationApp.get(SocketRegistryService).register(authorId, fakeSocket as never);

      // ModerationTrend is a pure aggregate (date/category/verdict, no
      // postId) — a prior run can leave a row matching the same
      // category/verdict this run produces. Baseline the count first so the
      // assertion below is coupled to *this* run's event, not "a row
      // happens to exist" (review finding #1).
      const today = new Date();
      const trendDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const analyticsPrisma = analyticsApp.get(AnalyticsPrismaService);
      const baselineTrend = await analyticsPrisma.moderationTrend.findUnique({
        where: { date_category_verdict: { date: trendDate, category: 'spam', verdict: 'rejected' } },
      });
      const baselineCount = baselineTrend?.count ?? 0;

      // Step 1: create a post — real PostsService, real Postgres transaction
      // (Post + OutboxMessage rows), same as the production REST path minus
      // the gateway/auth layer (already covered by unit/guard tests).
      const post = await contentApp
        .get(PostsService)
        .create(authorId, { content: 'this is a test post' });

      // Step 2: content-service's outbox relay (real @Interval, real
      // RabbitMQ) picks up the job row and publishes it — wait for the row
      // to be marked published.
      const contentPrisma = contentApp.get(ContentPrismaService);
      const jobOutboxRow = await waitFor(async () => {
        const row = await contentPrisma.outboxMessage.findFirst({
          where: { eventType: 'moderation.job', payload: { path: ['postId'], equals: post.id } },
        });
        return row?.publishedAt ? row : undefined;
      });

      // Step 3: ai-processing-service consumes the real RabbitMQ job, calls
      // (mocked) Cloudflare, publishes moderation.completed back to
      // RabbitMQ; content-service consumes that, updates Post.status, and
      // writes a new outbox row (Kafka-routed) with authorId — wait for the
      // post's status to flip off "pending".
      await waitFor(() =>
        contentPrisma.post.findUnique({ where: { id: post.id } }).then((p) =>
          p && p.status !== 'pending' ? p : undefined,
        ),
      );
      const completedOutboxRow = await waitFor(async () => {
        const row = await contentPrisma.outboxMessage.findFirst({
          where: {
            eventType: 'moderation.completed',
            payload: { path: ['postId'], equals: post.id },
          },
        });
        return row ?? undefined;
      });

      // Step 4: same outbox relay, second poll cycle, publishes the
      // moderation-completed fact to the real Kafka topic.

      // Step 5: analytics-service's real Kafka consumer persists a trend
      // row — assert it moved by exactly the one increment this run caused.
      const trend = await waitFor(async () => {
        const row = await analyticsPrisma.moderationTrend.findUnique({
          where: { date_category_verdict: { date: trendDate, category: 'spam', verdict: 'rejected' } },
        });
        return row && row.count > baselineCount ? row : undefined;
      });
      expect(trend.count).toBe(baselineCount + 1);

      // Step 6: notification-service's real Kafka consumer resolves the
      // registered socket by authorId and pushes the verdict.
      await waitFor(async () => (fakeSocket.emit.mock.calls.length > 0 ? true : undefined));
      expect(fakeSocket.emit).toHaveBeenCalledWith('moderation.completed', {
        postId: post.id,
        verdict: 'rejected',
        categories: ['spam'],
      });

      const finalPost = await contentPrisma.post.findUnique({ where: { id: post.id } });
      expect(finalPost?.status).toBe('rejected');

      // Cleanup: this test's own rows only. Two things intentionally left
      // behind:
      // - The ModerationTrend row — a shared aggregate; artificially
      //   decrementing it post-test is more surprising than an accumulating
      //   dev-DB count (real production trend data accumulates the same
      //   way).
      // - Content Service's own ProcessedMessage row for the RabbitMQ
      //   moderation.completed hop — its key is the randomUUID() minted
      //   inside ai-processing-service's ModerationConsumerService, not
      //   jobOutboxRow.id/completedOutboxRow.id, and this test never
      //   captures it. One small dedupe-bookkeeping row left per run;
      //   cheap to ignore, not cheap to correctly capture without spying on
      //   internal ID generation.
      await contentPrisma.outboxMessage.deleteMany({
        where: { id: { in: [jobOutboxRow.id, completedOutboxRow.id] } },
      });
      await contentPrisma.post.delete({ where: { id: post.id } });
      await analyticsPrisma.processedMessage.deleteMany({
        where: { messageId: completedOutboxRow.id },
      });
    },
    // 5 waitFor calls in this test, each defaulting to a 30s internal
    // timeout — worst case 150s. This must exceed that sum, or Jest can
    // kill an otherwise still-progressing test with a less useful timeout
    // error than waitFor's own message (review finding #3). In practice the
    // whole chain completes in ~10-20s; this ceiling only matters if
    // something is actually broken.
    180000,
  );
});
