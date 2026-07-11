import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { KAFKA_PUBLISHER, PUBLISHER, Publisher } from '@intellect-stream/shared-messaging';
import { PrismaService } from '../prisma/prisma.service';
import { Broker, RELAY_ROUTING } from './relay-routing.config';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
// BUG-0006: rows that fail this many times stop competing for batch slots.
// They stay in the table (decision 14: never silent-drop) — manual replay is
// resetting attempts, same log-and-alert posture as decision 10's DLQ.
const MAX_ATTEMPTS = 10;

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
      // BUG-0006: exclude quarantined rows so a stuck row (unroutable
      // eventType, poison payload) can't occupy a batch slot forever and
      // starve everything behind it.
      where: { publishedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      take: BATCH_SIZE,
      orderBy: { occurredAt: 'asc' },
    });

    for (const row of pending) {
      const route = RELAY_ROUTING[row.eventType];
      if (!route) {
        this.logger.error(
          `No relay route for eventType "${row.eventType}" (outbox row ${row.id}) — left pending`,
        );
        await this.recordFailure(row.id, row.attempts, 'no relay route');
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
        await this.recordFailure(row.id, row.attempts, 'publish failed');
      }
    }
  }

  private async recordFailure(rowId: string, priorAttempts: number, reason: string) {
    const attempts = priorAttempts + 1;
    try {
      await this.prisma.outboxMessage.update({
        where: { id: rowId },
        data: { attempts, lastAttemptAt: new Date() },
      });
    } catch (err) {
      // Bookkeeping failure must not abort the rest of the batch; the row
      // simply retries with an unchanged counter next poll.
      this.logger.error(`Failed to record attempt for outbox row ${rowId}`, err as Error);
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `Outbox row ${rowId} quarantined after ${attempts} failed attempts (${reason}) — ` +
          `manual replay: reset attempts to 0`,
      );
    }
  }
}
