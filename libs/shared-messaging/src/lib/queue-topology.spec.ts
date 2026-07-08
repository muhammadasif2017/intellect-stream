import * as amqp from 'amqplib';
import { assertQueueTopology, deadLetterQueueName } from './queue-topology';

describe('deadLetterQueueName', () => {
  it('appends .dlq to the queue name', () => {
    expect(deadLetterQueueName('moderation.job')).toBe('moderation.job.dlq');
  });
});

describe('assertQueueTopology', () => {
  it('declares the DLQ before the main queue, wiring the main queue to it', async () => {
    const channel = { assertQueue: jest.fn().mockResolvedValue(undefined) };

    await assertQueueTopology(channel as unknown as amqp.Channel, 'moderation.job');

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

  it('produces identical arguments for the same queue name every call', async () => {
    const channel = { assertQueue: jest.fn().mockResolvedValue(undefined) };

    await assertQueueTopology(channel as unknown as amqp.Channel, 'moderation.completed');
    await assertQueueTopology(channel as unknown as amqp.Channel, 'moderation.completed');

    const firstCallArgs = channel.assertQueue.mock.calls.slice(0, 2);
    const secondCallArgs = channel.assertQueue.mock.calls.slice(2, 4);
    expect(secondCallArgs).toEqual(firstCallArgs);
  });
});
