import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { MessageEnvelope, RabbitMqConsumer } from '@intellect-stream/shared-messaging';
import {
  MODERATION_COMPLETED_DLQ,
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
      { queue: MODERATION_COMPLETED_QUEUE, deadLetterQueue: MODERATION_COMPLETED_DLQ },
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
