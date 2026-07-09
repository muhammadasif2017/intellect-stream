import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { Publisher } from './publisher.interface';

interface EnvelopeWithPostId {
  payload?: { postId?: unknown };
}

// ADR-0009: partition key = postId, so per-post ordering is preserved if a
// post is ever re-moderated. Falls back to kafkajs's default (round-robin)
// partitioning when a payload has no postId.
function partitionKey(message: unknown): string | undefined {
  const postId = (message as EnvelopeWithPostId)?.payload?.postId;
  return typeof postId === 'string' ? postId : undefined;
}

@Injectable()
export class KafkaPublisher implements Publisher, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaPublisher.name);
  private producer?: Producer;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const brokers = this.config.getOrThrow<string>('KAFKA_BROKERS').split(',');
    const clientId = this.config.getOrThrow<string>('KAFKA_CLIENT_ID');
    const kafka = new Kafka({ clientId, brokers });
    this.producer = kafka.producer();
    await this.producer.connect();
  }

  async publish(destination: string, message: unknown): Promise<void> {
    if (!this.producer) {
      throw new Error('Kafka producer not initialized');
    }
    await this.producer.send({
      topic: destination,
      messages: [{ key: partitionKey(message), value: JSON.stringify(message) }],
    });
  }

  async onModuleDestroy() {
    await this.producer?.disconnect();
  }
}
