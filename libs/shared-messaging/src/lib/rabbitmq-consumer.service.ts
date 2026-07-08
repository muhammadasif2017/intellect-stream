import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MessageEnvelope } from './message-envelope';

export interface ConsumeOptions {
  queue: string;
  /**
   * Queue a failed message is routed to instead of being dropped. No
   * automated retry/replay (decision 10) — one processing failure is
   * terminal for the message, logged, and left for manual replay.
   */
  deadLetterQueue?: string;
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

    if (options.deadLetterQueue) {
      await channel.assertQueue(options.deadLetterQueue, { durable: true });
    }
    await channel.assertQueue(options.queue, {
      durable: true,
      ...(options.deadLetterQueue && {
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': options.deadLetterQueue,
        },
      }),
    });
    await channel.prefetch(options.prefetch ?? 10);

    await channel.consume(options.queue, async (msg) => {
      if (!msg) {
        return;
      }
      await this.handleMessage(channel, msg, handler);
    });
  }

  private async handleMessage<TPayload>(
    channel: amqp.Channel,
    msg: amqp.ConsumeMessage,
    handler: EnvelopeHandler<TPayload>,
  ) {
    try {
      const envelope = JSON.parse(msg.content.toString()) as MessageEnvelope<TPayload>;
      await handler(envelope);
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Failed to process message on queue "${msg.fields.routingKey}", sending to DLQ`,
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
