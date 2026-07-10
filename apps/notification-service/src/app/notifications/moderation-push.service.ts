import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { KafkaConsumer, MessageEnvelope } from '@intellect-stream/shared-messaging';
import {
  MODERATION_COMPLETED_TOPIC,
  ModerationCompletedPayload,
} from '@intellect-stream/shared-dtos';
import { SocketRegistryService } from '../registry/socket-registry.service';

// Decision 20: every instance joins with its own unique groupId, so Kafka
// hands every instance every event (broadcast) instead of splitting the
// topic across instances (work-queue semantics, wrong shape here — a
// notification has to reach whichever instance holds the user's socket).
const GROUP_ID = `notification-service-${randomUUID()}`;

@Injectable()
export class ModerationPushService implements OnModuleInit {
  private readonly logger = new Logger(ModerationPushService.name);

  constructor(
    private readonly consumer: KafkaConsumer,
    private readonly registry: SocketRegistryService,
  ) {}

  async onModuleInit() {
    await this.consumer.consume<ModerationCompletedPayload>(
      { topic: MODERATION_COMPLETED_TOPIC, groupId: GROUP_ID },
      (envelope) => this.handle(envelope),
    );
  }

  private async handle(envelope: MessageEnvelope<ModerationCompletedPayload>) {
    const payload = plainToInstance(ModerationCompletedPayload, envelope.payload);
    await validateOrReject(payload);

    // Decision 22: authorId is filled in by Content Service before this
    // reaches Kafka. Its absence means an older/malformed event — nothing to
    // route it to, so log and drop rather than guessing a recipient.
    if (!payload.authorId) {
      this.logger.warn(`Moderation event for post ${payload.postId} has no authorId, dropping`);
      return;
    }

    const sockets = this.registry.getSockets(payload.authorId);
    if (sockets.length === 0) {
      // Best-effort live push (interview doc Q13) — a user with no open
      // socket simply misses it. No queue, no persistence, no DB in this
      // service by design (decision 20).
      return;
    }

    for (const socket of sockets) {
      socket.emit('moderation.completed', {
        postId: payload.postId,
        verdict: payload.verdict,
        categories: payload.categories,
      });
    }
  }
}
