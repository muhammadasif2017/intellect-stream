import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Publisher } from './publisher.interface';
import { assertQueueTopology } from './queue-topology';

const RECONNECT_DELAY_MS = 5000;

@Injectable()
export class RabbitMqPublisher implements Publisher, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqPublisher.name);
  private url!: string;
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private closing = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.url = this.config.getOrThrow<string>('RABBITMQ_URL');
    // Fail-fast at boot; reconnect covers established-then-lost only.
    await this.connect();
  }

  private async connect() {
    await this.teardown();

    const connection = await amqp.connect(this.url);
    this.connection = connection;
    connection.on('error', (err) => {
      this.logger.error('RabbitMQ connection error', err as Error);
    });
    connection.on('close', () => {
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
      if (this.channel === channel) {
        this.scheduleReconnect('channel closed');
      }
    });
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
    // Drop the dead channel immediately so publish() fails fast instead of
    // writing into a closed channel.
    this.channel = undefined;
    this.logger.warn(`RabbitMQ ${reason} — reconnecting in ${RECONNECT_DELAY_MS}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect()
        .then(() => this.logger.log('RabbitMQ publisher reconnected'))
        .catch((err) => {
          this.logger.error('RabbitMQ reconnect failed', err as Error);
          this.scheduleReconnect('reconnect failed');
        });
    }, RECONNECT_DELAY_MS);
  }

  async publish(destination: string, message: unknown): Promise<void> {
    // Mid-reconnect the channel is gone: throw so the caller's own retry
    // machinery (the outbox relay's attempt counter) owns the failure —
    // no buffering here, the outbox row *is* the buffer.
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    await assertQueueTopology(this.channel, destination);
    this.channel.sendToQueue(destination, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
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
