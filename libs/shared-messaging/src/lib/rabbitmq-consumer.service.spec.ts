import * as amqp from 'amqplib';
import { RabbitMqConsumer } from './rabbitmq-consumer.service';
import { MessageEnvelope } from './message-envelope';

jest.mock('amqplib');

function makeMsg(body: unknown, headers: Record<string, unknown> = {}): amqp.ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(body)),
    fields: { routingKey: 'moderation.job' },
    properties: { headers },
  } as unknown as amqp.ConsumeMessage;
}

// Shape RabbitMQ produces after `count` rejected deliveries from `queue`
// have cycled through the retry queue.
function xDeathHeaders(queue: string, count: number) {
  return {
    'x-death': [
      { queue: `${queue}.retry`, reason: 'expired', count },
      { queue, reason: 'rejected', count },
    ],
  };
}

describe('RabbitMqConsumer', () => {
  let channel: {
    assertQueue: jest.Mock;
    prefetch: jest.Mock;
    consume: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
    sendToQueue: jest.Mock;
    on: jest.Mock;
  };
  let connection: { createChannel: jest.Mock; close: jest.Mock; on: jest.Mock };
  let configMock: { getOrThrow: jest.Mock };
  let consumer: RabbitMqConsumer;

  beforeEach(async () => {
    jest.clearAllMocks();
    channel = {
      assertQueue: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
      sendToQueue: jest.fn(),
      on: jest.fn(),
    };
    connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
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

  it('asserts DLQ, retry queue, and main queue wired for the retry cycle', async () => {
    await consumer.consume({ queue: 'moderation.job' }, jest.fn());

    expect(channel.assertQueue).toHaveBeenNthCalledWith(1, 'moderation.job.dlq', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenNthCalledWith(
      2,
      'moderation.job.retry',
      expect.objectContaining({ durable: true }),
    );
    expect(channel.assertQueue).toHaveBeenNthCalledWith(3, 'moderation.job', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'moderation.job.retry',
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

  it('nacks without requeue (into the retry cycle) when the handler throws', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('CF Workers AI unreachable'));
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];
    const msg = makeMsg({ eventType: 'moderation.job' });

    await onMessage(msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('nacks without requeue when the message body is not valid JSON', async () => {
    const handler = jest.fn();
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];
    const msg = {
      content: Buffer.from('not json'),
      fields: { routingKey: 'moderation.job' },
      properties: { headers: {} },
    } as unknown as amqp.ConsumeMessage;

    await onMessage(msg);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it('still hands the message to the handler below MAX_DELIVERIES', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];
    const msg = makeMsg({ eventType: 'moderation.job' }, xDeathHeaders('moderation.job', 4));

    await onMessage(msg);

    expect(handler).toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('routes an exhausted message to the DLQ and acks, without invoking the handler', async () => {
    const handler = jest.fn();
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];
    const headers = xDeathHeaders('moderation.job', 5);
    const msg = makeMsg({ eventType: 'moderation.job' }, headers);

    await onMessage(msg);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.sendToQueue).toHaveBeenCalledWith('moderation.job.dlq', msg.content, {
      persistent: true,
      headers,
    });
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('ignores x-death entries from other queues when counting deliveries', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await consumer.consume({ queue: 'moderation.job' }, handler);
    const onMessage = channel.consume.mock.calls[0][1];
    // rejected count belongs to a different queue — must not trigger DLQ here
    const msg = makeMsg(
      { eventType: 'moderation.job' },
      { 'x-death': [{ queue: 'other.queue', reason: 'rejected', count: 99 }] },
    );

    await onMessage(msg);

    expect(handler).toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
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

  describe('reconnect', () => {
    function fireConnectionClose() {
      const closeCall = connection.on.mock.calls.find(([event]) => event === 'close');
      (closeCall[1] as () => void)();
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('reconnects after the connection closes and replays active consumers', async () => {
      await consumer.consume({ queue: 'moderation.job' }, jest.fn());
      expect(channel.consume).toHaveBeenCalledTimes(1);

      fireConnectionClose();
      await jest.advanceTimersByTimeAsync(5000);

      expect(amqp.connect).toHaveBeenCalledTimes(2);
      // topology + prefetch + consume replayed on the fresh channel
      expect(channel.consume).toHaveBeenCalledTimes(2);
      expect(channel.consume).toHaveBeenLastCalledWith('moderation.job', expect.any(Function));
    });

    it('keeps retrying when the reconnect itself fails', async () => {
      (amqp.connect as jest.Mock)
        .mockRejectedValueOnce(new Error('still down'))
        .mockResolvedValue(connection);

      fireConnectionClose();
      await jest.advanceTimersByTimeAsync(5000); // attempt 1 fails
      await jest.advanceTimersByTimeAsync(5000); // attempt 2 succeeds

      // initial + failed attempt + successful attempt
      expect(amqp.connect).toHaveBeenCalledTimes(3);
    });

    it('does not reconnect after module destroy', async () => {
      await consumer.onModuleDestroy();

      fireConnectionClose();
      await jest.advanceTimersByTimeAsync(20000);

      expect(amqp.connect).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalled();
    });
  });
});
