import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka } from 'kafkajs';
import { KAFKA_CLIENT_ID } from './kafka-client-id.token';
import { MessageEnvelope } from './message-envelope';

export interface KafkaConsumeOptions {
  topic: string;
  groupId: string;
}

export type KafkaEnvelopeHandler<TPayload = unknown> = (
  envelope: MessageEnvelope<TPayload>,
) => Promise<void>;

@Injectable()
export class KafkaConsumer implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumer.name);
  private consumer?: Consumer;

  constructor(
    private readonly config: ConfigService,
    @Inject(KAFKA_CLIENT_ID) private readonly clientId: string,
  ) {}

  async consume<TPayload = unknown>(
    options: KafkaConsumeOptions,
    handler: KafkaEnvelopeHandler<TPayload>,
  ): Promise<void> {
    const brokers = this.config.getOrThrow<string>('KAFKA_BROKERS').split(',');
    const kafka = new Kafka({ clientId: this.clientId, brokers });
    this.consumer = kafka.consumer({ groupId: options.groupId });

    await this.consumer.connect();
    await this.consumer.subscribe({ topic: options.topic, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        try {
          const envelope = JSON.parse(message.value.toString()) as MessageEnvelope<TPayload>;
          await handler(envelope);
        } catch (err) {
          // No DLQ topic for Kafka in this design (out of scope for this
          // milestone — unlike RabbitMQ's per-message nack-to-DLQ, Kafka has
          // no built-in per-message redelivery primitive; rethrowing would
          // stall the whole partition on one poison message). Log and move
          // on: the offset still commits, the bad message is skipped.
          this.logger.error(
            `Failed to process message on topic "${options.topic}", skipping`,
            err as Error,
          );
        }
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer?.disconnect();
  }
}
