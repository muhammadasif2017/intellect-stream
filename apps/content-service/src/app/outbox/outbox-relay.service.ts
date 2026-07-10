import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { KAFKA_PUBLISHER, PUBLISHER, Publisher } from '@intellect-stream/shared-messaging';
import { PrismaService } from '../prisma/prisma.service';
import { Broker, RELAY_ROUTING } from './relay-routing.config';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly publishers: Record<Broker, Publisher>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLISHER) rabbitMqPublisher: Publisher,
    @Inject(KAFKA_PUBLISHER) kafkaPublisher: Publisher,
  ) {
    this.publishers = { rabbitmq: rabbitMqPublisher, kafka: kafkaPublisher };
  }

  @Interval(POLL_INTERVAL_MS)
  async poll() {
    const pending = await this.prisma.outboxMessage.findMany({
      where: { publishedAt: null },
      take: BATCH_SIZE,
      orderBy: { occurredAt: 'asc' },
    });

    for (const row of pending) {
      const route = RELAY_ROUTING[row.eventType];
      if (!route) {
        this.logger.error(
          `No relay route for eventType "${row.eventType}" (outbox row ${row.id}) — left pending`,
        );
        continue;
      }

      try {
        await this.publishers[route.broker].publish(route.destination, {
          messageId: row.id,
          correlationId: row.correlationId,
          eventType: row.eventType,
          eventVersion: row.eventVersion,
          occurredAt: row.occurredAt,
          source: row.source,
          payload: row.payload,
        });

        await this.prisma.outboxMessage.update({
          where: { id: row.id },
          data: { publishedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(
          `Failed to publish outbox row ${row.id}, will retry next poll`,
          err as Error,
        );
      }
    }
  }
}
