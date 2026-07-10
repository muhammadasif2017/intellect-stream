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
  for (;;) {
    const result = await fn();
    if (result) {
      return result;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
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
      await waitFor(async () => {
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

      // Step 4: same outbox relay, second poll cycle, publishes the
      // moderation-completed fact to the real Kafka topic.

      // Step 5: analytics-service's real Kafka consumer persists a trend row.
      const analyticsPrisma = analyticsApp.get(AnalyticsPrismaService);
      const trend = await waitFor(() =>
        analyticsPrisma.moderationTrend.findFirst({
          where: { category: 'spam', verdict: 'rejected' },
          orderBy: { date: 'desc' },
        }),
      );
      expect(trend?.count).toBeGreaterThanOrEqual(1);

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
    },
    45000,
  );
});
