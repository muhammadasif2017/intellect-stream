import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { randomUUID } from 'crypto';
import { RedisClientType } from 'redis';
import {
  MessageEnvelope,
  PUBLISHER,
  Publisher,
  RabbitMqConsumer,
} from '@intellect-stream/shared-messaging';
import {
  MODERATION_COMPLETED_EVENT_TYPE,
  MODERATION_COMPLETED_QUEUE,
  MODERATION_JOB_QUEUE,
  ModerationCompletedPayload,
  ModerationJobPayload,
} from '@intellect-stream/shared-dtos';
import { REDIS_CLIENT } from '@intellect-stream/shared-redis';
import { CfWorkersAiService } from './cf-workers-ai.service';

// Claim TTL bounds how long a crashed/slow worker blocks redelivery of the
// same message; done TTL is how long a completed message stays deduped.
const CLAIM_TTL_SECONDS = 5 * 60;
const DONE_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class ModerationConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ModerationConsumerService.name);

  constructor(
    private readonly consumer: RabbitMqConsumer,
    @Inject(PUBLISHER) private readonly publisher: Publisher,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    private readonly cfWorkersAi: CfWorkersAiService,
  ) {}

  async onModuleInit() {
    await this.consumer.consume<ModerationJobPayload>(
      { queue: MODERATION_JOB_QUEUE },
      (envelope) => this.handle(envelope),
    );
  }

  private async handle(envelope: MessageEnvelope<ModerationJobPayload>) {
    const dedupeKey = `moderation:processed:${envelope.messageId}`;

    // Decision 6: stateless consumer dedupes via Redis SETNX. Claimed here,
    // released on failure so a manual DLQ replay isn't blocked forever by a
    // message that never actually completed.
    const claimed = await this.redis.set(dedupeKey, 'processing', {
      NX: true,
      EX: CLAIM_TTL_SECONDS,
    });
    if (!claimed) {
      this.logger.warn(`Duplicate delivery of message ${envelope.messageId}, skipping`);
      return;
    }

    try {
      const payload = plainToInstance(ModerationJobPayload, envelope.payload);
      await validateOrReject(payload);

      const { verdict, categories } = await this.cfWorkersAi.classify(payload.content);

      const result: ModerationCompletedPayload = { postId: payload.postId, verdict, categories };
      const outEnvelope: MessageEnvelope<ModerationCompletedPayload> = {
        messageId: randomUUID(),
        correlationId: envelope.correlationId,
        eventType: MODERATION_COMPLETED_EVENT_TYPE,
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        source: 'ai-processing-service',
        payload: result,
      };
      await this.publisher.publish(MODERATION_COMPLETED_QUEUE, outEnvelope);

      await this.redis.set(dedupeKey, 'done', { EX: DONE_TTL_SECONDS });
    } catch (err) {
      await this.redis.del(dedupeKey);
      throw err;
    }
  }
}
