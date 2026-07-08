import * as amqp from 'amqplib';
import { RabbitMqConsumer } from './rabbitmq-consumer.service';
import { MessageEnvelope } from './message-envelope';

jest.mock('amqplib');

function makeMsg(body: unknown): amqp.ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(body)),
    fields: { routingKey: 'moderation.job' },
  } as unknown as amqp.ConsumeMessage;
}

describe('RabbitMqConsumer', () => {
  let channel: {
    assertQueue: jest.Mock;
    prefetch: jest.Mock;
    consume: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
  };
  let connection: { createChannel: jest.Mock; close: jest.Mock };
  let configMock: { getOrThrow: jest.Mock };
  let consumer: RabbitMqConsumer;

  beforeEach(async () => {
    channel = {
      assertQueue: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
    };
    connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    configMock = { getOrThrow: jest.fn().mockReturnValue('amqp://localhost') };

    consumer = new RabbitMqConsumer(configMock as never);
    await consumer.onModuleInit();
  });

  it('throws if consume is called before the channel is initialized', async () => {
    const uninitialized = new RabbitMqConsumer(configMock as never);

    await expect(
      uninitialized.consume({ queue: 'moderation.job' }, jest.fn()),
    ).rejects.toThrow('RabbitMQ channel not initialized');
  });

  it('asserts only the main queue when no dead-letter queue is given', async () => {
    await consumer.consume({ queue: 'moderation.job' }, jest.fn());

    expect(channel.assertQueue).toHaveBeenCalledTimes(1);
    expect(channel.assertQueue).toHaveBeenCalledWith('moderation.job', { durable: true });
  });

  it('asserts the DLQ and wires the main queue to it when given', async () => {
    await consumer.consume(
      { queue: 'moderation.job', deadLetterQueue: 'moderation.job.dlq' },
      jest.fn(),
    );

    expect(channel.assertQueue).toHaveBeenNthCalledWith(1, 'moderation.job.dlq', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenNthCalledWith(2, 'moderation.job', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'moderation.job.dlq',
      },
    });
  });

  it('defaults prefetch to 10, honors an explicit value', async () => {
    await consumer.consume({ queue: 'moderation.job' }, jest.fn());
    expect(channel.prefetch).toHaveBeenCalledWith(10);

    await consumer.consume({ queue: 'moderation.job', prefetch: 3 }, jest.fn());
    expect(channel.prefetch).toHaveBeenCalledWith(3);
  });

  it('parses the envelope, hands it to the handler, and acks on success', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];

    const envelope: MessageEnvelope<{ postId: string }> = {
      messageId: 'm1',
      correlationId: 'c1',
      eventType: 'moderation.job',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      source: 'content-service',
      payload: { postId: 'p1' },
    };
    const msg = makeMsg(envelope);

    await onMessage(msg);

    expect(handler).toHaveBeenCalledWith(envelope);
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('nacks without requeue (straight to DLQ) when the handler throws', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('CF Workers AI unreachable'));
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];
    const msg = makeMsg({ eventType: 'moderation.job' });

    await onMessage(msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('nacks without requeue when the message body is not valid JSON', async () => {
    const handler = jest.fn();
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];
    const msg = { content: Buffer.from('not json'), fields: { routingKey: 'moderation.job' } } as unknown as amqp.ConsumeMessage;

    await onMessage(msg);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it('ignores a null message (consumer cancellation notification)', async () => {
    const handler = jest.fn();
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];

    await onMessage(null);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
