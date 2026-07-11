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

    // kafkajs restarts itself after retriable crashes; a non-retriable crash
    // stops the consumer permanently (deliberate — see the handler-error
    // comment below). Either way it must be loud, not a silent zombie:
    // restart=false in this log is the "human needed now" signal.
    this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
      this.logger.error(
        `Kafka consumer crashed on topic "${options.topic}" (restart=${payload.restart})`,
        payload.error,
      );
    });

    await this.consumer.connect();
    await this.consumer.subscribe({ topic: options.topic, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }

        let envelope: MessageEnvelope<TPayload>;
        try {
          envelope = JSON.parse(message.value.toString()) as MessageEnvelope<TPayload>;
        } catch (err) {
          // Malformed JSON is unrecoverable — retrying changes nothing. Log
          // and move on so one poison message doesn't stall the partition.
          // No DLQ topic for Kafka in this design (out of scope for this
          // milestone).
          this.logger.error(
            `Malformed message on topic "${options.topic}", skipping`,
            err as Error,
          );
          return;
        }

        // Handler errors are deliberately NOT swallowed here — they propagate
        // to kafkajs, which retries rather than auto-committing the offset.
        // That's what makes at-least-once + dedupe (decision 6,
        // ProcessedMessage) actually hold: a transient failure (DB blip)
        // gets redelivered and retried safely. Distinguishing a genuinely
        // poison payload from a transient one is the handler's job (e.g.
        // catch-and-skip a known "already processed" conflict, rethrow
        // everything else). Persistent failure eventually exhausts
        // kafkajs's retry policy and crashes the consumer — restart is a
        // manual/process-manager concern, same "log + alert, manual replay"
        // spirit as decision 10's RabbitMQ DLQ.
        try {
          await handler(envelope);
        } catch (err) {
          // ADR-0013: log with the chain's ids before rethrowing — kafkajs's
          // own retry logging doesn't know the envelope exists.
          this.logger.error(
            `Handler failed for message ${envelope.messageId} ` +
              `(correlation ${envelope.correlationId}) on topic "${options.topic}" — ` +
              `kafkajs will retry`,
            err as Error,
          );
          throw err;
        }
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer?.disconnect();
  }
}
