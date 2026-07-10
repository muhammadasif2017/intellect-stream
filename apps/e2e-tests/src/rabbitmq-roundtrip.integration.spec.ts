import 'dotenv/config';
import type { ConfigService } from '@nestjs/config';
import { RabbitMqConsumer, RabbitMqPublisher } from '@intellect-stream/shared-messaging';

// Feasibility probe for milestone 8: proves this environment can actually run
// a test against the real docker-compose stack (not mocks) before any
// cross-service golden-path test is built on top of it. If this doesn't pass
// here, nothing built on real infra will either.
function fakeConfig(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === 'RABBITMQ_URL') {
        if (!process.env.RABBITMQ_URL) {
          throw new Error('RABBITMQ_URL not set — is .env loaded?');
        }
        return process.env.RABBITMQ_URL;
      }
      throw new Error(`Unexpected config key in test: ${key}`);
    },
  } as unknown as ConfigService;
}

describe('RabbitMQ round-trip (real broker)', () => {
  const queue = `e2e-feasibility-probe-${Date.now()}`;
  let publisher: RabbitMqPublisher;
  let consumer: RabbitMqConsumer;

  beforeAll(async () => {
    publisher = new RabbitMqPublisher(fakeConfig());
    consumer = new RabbitMqConsumer(fakeConfig());
    await publisher.onModuleInit();
    await consumer.onModuleInit();
  });

  afterAll(async () => {
    await publisher.onModuleDestroy();
    await consumer.onModuleDestroy();
  });

  it('delivers a published envelope to a real consumer', async () => {
    const received = new Promise<{ messageId: string }>((resolve) => {
      consumer.consume<{ ping: string }>({ queue }, async (envelope) => {
        resolve(envelope as unknown as { messageId: string });
      });
    });

    await publisher.publish(queue, {
      messageId: 'probe-1',
      correlationId: 'probe-1',
      eventType: 'e2e.probe',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      source: 'e2e-tests',
      payload: { ping: 'pong' },
    });

    const envelope = await received;
    expect(envelope.messageId).toBe('probe-1');
  }, 15000);
});
