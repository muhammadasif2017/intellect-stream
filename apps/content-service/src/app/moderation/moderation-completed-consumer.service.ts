import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { MessageEnvelope, RabbitMqConsumer } from '@intellect-stream/shared-messaging';
import {
  MODERATION_COMPLETED_EVENT_TYPE,
  MODERATION_COMPLETED_QUEUE,
  ModerationCompletedPayload,
} from '@intellect-stream/shared-dtos';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class ModerationCompletedConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ModerationCompletedConsumerService.name);

  constructor(
    private readonly consumer: RabbitMqConsumer,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.consumer.consume<ModerationCompletedPayload>(
      { queue: MODERATION_COMPLETED_QUEUE },
      (envelope) => this.handle(envelope),
    );
  }

  private async handle(envelope: MessageEnvelope<ModerationCompletedPayload>) {
    const payload = plainToInstance(ModerationCompletedPayload, envelope.payload);
    await validateOrReject(payload);

    try {
      // Decision 6: DB consumer dedupes via unique constraint, written in the
      // same transaction as the state change it guards.
      await this.prisma.$transaction(async (tx) => {
        await tx.processedMessage.create({ data: { messageId: envelope.messageId } });
        await tx.post.update({
          where: { id: payload.postId },
          data: { status: payload.verdict },
        });
        // ADR-0009: relay this fact onward to Kafka via the outbox, in the
        // same transaction as the state change above — not a second publish
        // call from a stateless handler (see BUG-0005). correlationId is
        // carried forward, not re-minted, so the whole chain traces as one
        // request (decision 8).
        await tx.outboxMessage.create({
          data: {
            correlationId: envelope.correlationId,
            eventType: MODERATION_COMPLETED_EVENT_TYPE,
            source: 'content-service',
            payload: {
              postId: payload.postId,
              verdict: payload.verdict,
              categories: payload.categories,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`Duplicate delivery of message ${envelope.messageId}, skipping`);
        return;
      }
      throw err;
    }
  }
}
