import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MessageEnvelope } from './message-envelope';
import {
  assertQueueTopology,
  deadLetterQueueName,
  MAX_DELIVERIES,
} from './queue-topology';

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

export interface ConsumeOptions {
  queue: string;
  prefetch?: number;
}

export type EnvelopeHandler<TPayload = unknown> = (
  envelope: MessageEnvelope<TPayload>,
) => Promise<void>;

@Injectable()
export class RabbitMqConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumer.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.getOrThrow<string>('RABBITMQ_URL');
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
  }

  async consume<TPayload = unknown>(
    options: ConsumeOptions,
    handler: EnvelopeHandler<TPayload>,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    const channel = this.channel;

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
        `Message exhausted ${MAX_DELIVERIES} deliveries on queue "${queue}", routing to DLQ`,
      );
      channel.sendToQueue(deadLetterQueueName(queue), msg.content, {
        persistent: true,
        headers: msg.properties.headers,
      });
      channel.ack(msg);
      return;
    }

    try {
      const envelope = JSON.parse(msg.content.toString()) as MessageEnvelope<TPayload>;
      await handler(envelope);
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Failed to process message on queue "${queue}" ` +
          `(delivery ${failures + 1}/${MAX_DELIVERIES}), will retry`,
        err as Error,
      );
      channel.nack(msg, false, false);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
