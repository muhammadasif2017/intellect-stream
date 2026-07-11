import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MessageEnvelope } from './message-envelope';
import {
  assertQueueTopology,
  deadLetterQueueName,
  MAX_DELIVERIES,
} from './queue-topology';

const RECONNECT_DELAY_MS = 5000;

export interface ConsumeOptions {
  queue: string;
  prefetch?: number;
}

export type EnvelopeHandler<TPayload = unknown> = (
  envelope: MessageEnvelope<TPayload>,
) => Promise<void>;

interface XDeathEntry {
  queue: string;
  reason: string;
  count: number;
}

// x-death accumulates one entry per (queue, reason) pair; the entry for
// (main queue, rejected) counts how many retry cycles this message has done.
function deliveryFailures(msg: amqp.ConsumeMessage, queue: string): number {
  const deaths = msg.properties.headers?.['x-death'] as XDeathEntry[] | undefined;
  const entry = deaths?.find((d) => d.queue === queue && d.reason === 'rejected');
  return entry?.count ?? 0;
}

@Injectable()
export class RabbitMqConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumer.name);
  private url!: string;
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private closing = false;
  private reconnectTimer?: NodeJS.Timeout;
  // Everything consume() was ever asked to do, so a reconnect can replay it —
  // amqplib does not reconnect or restore consumers on its own, and without
  // this the service survives a broker restart as a silent zombie.
  private readonly subscriptions: Array<{
    options: ConsumeOptions;
    handler: EnvelopeHandler;
  }> = [];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.url = this.config.getOrThrow<string>('RABBITMQ_URL');
    // Initial connect stays fail-fast: broker down at boot should fail the
    // boot, not start a half-alive service. Reconnect handles the
    // established-then-lost case only.
    await this.connect();
  }

  private async connect() {
    await this.teardown();

    const connection = await amqp.connect(this.url);
    this.connection = connection;
    // An 'error' listener must exist or Node treats the emit as fatal;
    // 'close' always follows, so reconnect is scheduled there.
    connection.on('error', (err) => {
      this.logger.error('RabbitMQ connection error', err as Error);
    });
    connection.on('close', () => {
      // Identity check drops stale events from a connection we already
      // replaced (teardown clears the reference before closing).
      if (this.connection === connection) {
        this.scheduleReconnect('connection closed');
      }
    });

    const channel = await connection.createChannel();
    this.channel = channel;
    channel.on('error', (err) => {
      this.logger.error('RabbitMQ channel error', err as Error);
    });
    channel.on('close', () => {
      // A channel can die while the connection lives (e.g. a topology 406) —
      // its consumers are gone either way, so rebuild from scratch.
      if (this.channel === channel) {
        this.scheduleReconnect('channel closed');
      }
    });

    for (const sub of this.subscriptions) {
      await this.startConsume(channel, sub.options, sub.handler);
    }
  }

  private async teardown() {
    const connection = this.connection;
    this.connection = undefined;
    this.channel = undefined;
    if (connection) {
      try {
        await connection.close();
      } catch {
        // already closed — the usual case on the reconnect path
      }
    }
  }

  private scheduleReconnect(reason: string) {
    if (this.closing || this.reconnectTimer) {
      return;
    }
    // Drop the dead channel immediately so consume() fails fast instead of
    // declaring topology on a closed channel.
    this.channel = undefined;
    this.logger.warn(`RabbitMQ ${reason} — reconnecting in ${RECONNECT_DELAY_MS}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect()
        .then(() => {
          this.logger.log(
            `RabbitMQ reconnected, ${this.subscriptions.length} consumer(s) restored`,
          );
        })
        .catch((err) => {
          this.logger.error('RabbitMQ reconnect failed', err as Error);
          this.scheduleReconnect('reconnect failed');
        });
    }, RECONNECT_DELAY_MS);
  }

  async consume<TPayload = unknown>(
    options: ConsumeOptions,
    handler: EnvelopeHandler<TPayload>,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    this.subscriptions.push({ options, handler: handler as EnvelopeHandler });
    await this.startConsume(this.channel, options, handler as EnvelopeHandler);
  }

  private async startConsume(
    channel: amqp.Channel,
    options: ConsumeOptions,
    handler: EnvelopeHandler,
  ): Promise<void> {
    await assertQueueTopology(channel, options.queue);
    await channel.prefetch(options.prefetch ?? 10);

    await channel.consume(options.queue, async (msg) => {
      if (!msg) {
        return;
      }
      await this.handleMessage(channel, options.queue, msg, handler);
    });
  }

  private async handleMessage<TPayload>(
    channel: amqp.Channel,
    queue: string,
    msg: amqp.ConsumeMessage,
    handler: EnvelopeHandler<TPayload>,
  ) {
    // BUG-0007: a nack now cycles through <queue>.retry (TTL) back here, not
    // straight to the DLQ. Only a message that has exhausted MAX_DELIVERIES
    // is routed to the DLQ — transient failures retry, poison terminates.
    const failures = deliveryFailures(msg, queue);
    if (failures >= MAX_DELIVERIES) {
      this.logger.error(
        `Message exhausted ${MAX_DELIVERIES} deliveries on queue "${queue}"` +
          `${this.describeIds(msg)}, routing to DLQ`,
      );
      channel.sendToQueue(deadLetterQueueName(queue), msg.content, {
        persistent: true,
        headers: msg.properties.headers,
      });
      channel.ack(msg);
      return;
    }

    let envelope: MessageEnvelope<TPayload>;
    try {
      envelope = JSON.parse(msg.content.toString()) as MessageEnvelope<TPayload>;
    } catch (err) {
      this.logger.error(
        `Malformed message on queue "${queue}" ` +
          `(delivery ${failures + 1}/${MAX_DELIVERIES}), will retry`,
        err as Error,
      );
      channel.nack(msg, false, false);
      return;
    }

    try {
      await handler(envelope);
      channel.ack(msg);
    } catch (err) {
      // ADR-0013: messageId + correlationId on every failure log — the ids
      // are what let a stuck message be traced back through the whole chain.
      this.logger.error(
        `Failed to process message ${envelope.messageId} ` +
          `(correlation ${envelope.correlationId}) on queue "${queue}" ` +
          `(delivery ${failures + 1}/${MAX_DELIVERIES}), will retry`,
        err as Error,
      );
      channel.nack(msg, false, false);
    }
  }

  // Best-effort id extraction for logs on paths where the body may be
  // unparseable (the DLQ route also carries malformed messages).
  private describeIds(msg: amqp.ConsumeMessage): string {
    try {
      const envelope = JSON.parse(msg.content.toString()) as MessageEnvelope;
      return ` (message ${envelope.messageId}, correlation ${envelope.correlationId})`;
    } catch {
      return ' (unparseable body)';
    }
  }

  async onModuleDestroy() {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    await this.teardown();
  }
}
