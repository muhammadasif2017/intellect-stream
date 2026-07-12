import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { KafkaConsumer, MessageEnvelope } from '@intellect-stream/shared-messaging';
import {
  assertSupportedEventVersion,
  MODERATION_COMPLETED_TOPIC,
  ModerationCompletedPayload,
  UnsupportedEventVersionError,
} from '@intellect-stream/shared-dtos';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const CONSUMER_GROUP_ID = 'analytics-service';

// No categories on an approved verdict is the common case — still counted,
// under a sentinel bucket, so verdict trends aren't silently dropped.
const UNCATEGORIZED = 'none';

function toDateOnly(occurredAt: Date | string): Date {
  const d = new Date(occurredAt);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class TrendsService implements OnModuleInit {
  private readonly logger = new Logger(TrendsService.name);

  constructor(
    private readonly consumer: KafkaConsumer,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.consumer.consume<ModerationCompletedPayload>(
      { topic: MODERATION_COMPLETED_TOPIC, groupId: CONSUMER_GROUP_ID },
      (envelope) => this.handle(envelope),
    );
  }

  /* Read side (dashboard, via gateway proxy): raw rows, newest day first —
   * shaping into chart series is the client's concern. */
  trendsSince(days: number) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    return this.prisma.moderationTrend.findMany({
      where: { date: { gte: toDateOnly(cutoff) } },
      orderBy: { date: 'desc' },
      select: { date: true, category: true, verdict: true, count: true },
    });
  }

  private async handle(envelope: MessageEnvelope<ModerationCompletedPayload>) {
    // ADR-0012: a version from the future is permanent for this consumer —
    // rethrowing would make kafkajs retry forever and block the partition
    // behind one unreadable event. Log loudly and skip, same treatment as
    // malformed JSON in KafkaConsumer.
    try {
      assertSupportedEventVersion(envelope.eventType, envelope.eventVersion);
    } catch (err) {
      if (err instanceof UnsupportedEventVersionError) {
        this.logger.error(`${err.message} (message ${envelope.messageId}), skipping`);
        return;
      }
      throw err;
    }

    const payload = plainToInstance(ModerationCompletedPayload, envelope.payload);
    await validateOrReject(payload);

    const date = toDateOnly(envelope.occurredAt);
    const categories = payload.categories.length > 0 ? payload.categories : [UNCATEGORIZED];

    try {
      // Decision 6: DB consumer dedupes via unique constraint, written in the
      // same transaction as the state change it guards.
      await this.prisma.$transaction(async (tx) => {
        await tx.processedMessage.create({ data: { messageId: envelope.messageId } });

        for (const category of categories) {
          await tx.moderationTrend.upsert({
            where: { date_category_verdict: { date, category, verdict: payload.verdict } },
            create: { date, category, verdict: payload.verdict, count: 1 },
            update: { count: { increment: 1 } },
          });
        }
      });
      // Stage marker for the dashboard's trace view.
      this.logger.log(
        `Trend aggregated for post ${payload.postId} (${payload.verdict}) correlationId=${envelope.correlationId}`,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`Duplicate delivery of message ${envelope.messageId}, skipping`);
        return;
      }
      throw err;
    }
  }
}
