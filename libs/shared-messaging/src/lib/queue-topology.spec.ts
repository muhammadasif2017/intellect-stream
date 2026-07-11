import * as amqp from 'amqplib';
import {
  assertQueueTopology,
  deadLetterQueueName,
  retryQueueName,
  RETRY_TTL_MS,
} from './queue-topology';

describe('deadLetterQueueName', () => {
  it('appends .dlq to the queue name', () => {
    expect(deadLetterQueueName('moderation.job')).toBe('moderation.job.dlq');
  });
});

describe('retryQueueName', () => {
  it('appends .retry to the queue name', () => {
    expect(retryQueueName('moderation.job')).toBe('moderation.job.retry');
  });
});

describe('assertQueueTopology', () => {
  it('declares DLQ, then retry queue cycling back to main, then main queue dead-lettering to retry', async () => {
    const channel = { assertQueue: jest.fn().mockResolvedValue(undefined) };

    await assertQueueTopology(channel as unknown as amqp.Channel, 'moderation.job');

    expect(channel.assertQueue).toHaveBeenNthCalledWith(1, 'moderation.job.dlq', {
      durable: true,
    });
    // BUG-0007: retry queue holds the message for RETRY_TTL_MS, then
    // dead-letters it back to the main queue for another delivery.
    expect(channel.assertQueue).toHaveBeenNthCalledWith(2, 'moderation.job.retry', {
      durable: true,
      arguments: {
        'x-message-ttl': RETRY_TTL_MS,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'moderation.job',
      },
    });
    expect(channel.assertQueue).toHaveBeenNthCalledWith(3, 'moderation.job', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'moderation.job.retry',
      },
    });
  });

  it('produces identical arguments for the same queue name every call', async () => {
    const channel = { assertQueue: jest.fn().mockResolvedValue(undefined) };

    await assertQueueTopology(channel as unknown as amqp.Channel, 'moderation.completed');
    await assertQueueTopology(channel as unknown as amqp.Channel, 'moderation.completed');

    const firstCallArgs = channel.assertQueue.mock.calls.slice(0, 3);
    const secondCallArgs = channel.assertQueue.mock.calls.slice(3, 6);
    expect(secondCallArgs).toEqual(firstCallArgs);
  });
});
