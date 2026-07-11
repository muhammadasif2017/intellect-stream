import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { KAFKA_PUBLISHER, PUBLISHER, Publisher } from '@intellect-stream/shared-messaging';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { Broker, RELAY_ROUTING } from './relay-routing.config';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
// BUG-0006: rows that fail this many times stop competing for batch slots.
// They stay in the table (decision 14: never silent-drop) — manual replay is
// resetting attempts, same log-and-alert posture as decision 10's DLQ.
const MAX_ATTEMPTS = 10;
// The claim transaction holds row locks across broker publishes, so it needs
// more than Prisma's 5s default before it aborts mid-batch.
const CLAIM_TX_TIMEOUT_MS = 30_000;

// Shape returned by the raw claim query — mirrors the OutboxMessage columns
// the relay reads. Kept in sync manually; the model is small and stable.
interface ClaimedOutboxRow {
  id: string;
  correlationId: string;
  eventType: string;
  eventVersion: number;
  source: string;
  occurredAt: Date;
  payload: Prisma.JsonValue;
  attempts: number;
}

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
    try {
      await this.claimAndPublishBatch();
    } catch (err) {
      // A DB-level failure aborts the whole claim transaction: its
      // publishedAt marks roll back and every published-but-unmarked row
      // republishes next poll — consumers dedupe on messageId (decision 6),
      // so this degrades to duplicate delivery, never loss.
      this.logger.error('Outbox poll failed, batch rolled back', err as Error);
    }
  }

  private async claimAndPublishBatch() {
    // FOR UPDATE SKIP LOCKED: each relay claims its batch exclusively — a
    // second content-service instance (or this instance's own overlapping
    // poll, if a batch outlives the interval) skips claimed rows instead of
    // double-publishing them. Trade-off: broker I/O happens inside a DB
    // transaction, holding row locks for the batch's duration — standard for
    // competing outbox relays, bounded here by BATCH_SIZE and the tx timeout.
    await this.prisma.$transaction(
      async (tx) => {
        // BUG-0006: attempts < MAX_ATTEMPTS excludes quarantined rows so a
        // stuck row can't occupy a batch slot forever.
        const pending = await tx.$queryRaw<ClaimedOutboxRow[]>`
          SELECT "id", "correlationId", "eventType", "eventVersion",
                 "source", "occurredAt", "payload", "attempts"
          FROM "OutboxMessage"
          WHERE "publishedAt" IS NULL AND "attempts" < ${MAX_ATTEMPTS}
          ORDER BY "occurredAt" ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        `;

        for (const row of pending) {
          const route = RELAY_ROUTING[row.eventType];
          if (!route) {
            this.logger.error(
              `No relay route for eventType "${row.eventType}" (outbox row ${row.id}) — left pending`,
            );
            await this.recordFailure(tx, row.id, row.attempts, 'no relay route');
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

            await tx.outboxMessage.update({
              where: { id: row.id },
              data: { publishedAt: new Date() },
            });
          } catch (err) {
            this.logger.error(
              `Failed to publish outbox row ${row.id}, will retry next poll`,
              err as Error,
            );
            await this.recordFailure(tx, row.id, row.attempts, 'publish failed');
          }
        }
      },
      { timeout: CLAIM_TX_TIMEOUT_MS },
    );
  }

  private async recordFailure(
    tx: Prisma.TransactionClient,
    rowId: string,
    priorAttempts: number,
    reason: string,
  ) {
    const attempts = priorAttempts + 1;
    // No try/catch here: a failed statement aborts the surrounding Postgres
    // transaction anyway — swallowing it would just poison the rest of the
    // loop. Let it propagate to poll()'s rollback handler.
    await tx.outboxMessage.update({
      where: { id: rowId },
      data: { attempts, lastAttemptAt: new Date() },
    });
    if (attempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `Outbox row ${rowId} quarantined after ${attempts} failed attempts (${reason}) — ` +
          `manual replay: reset attempts to 0`,
      );
    }
  }
}
