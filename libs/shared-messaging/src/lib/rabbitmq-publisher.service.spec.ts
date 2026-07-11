import * as amqp from 'amqplib';
import { RabbitMqPublisher } from './rabbitmq-publisher.service';

jest.mock('amqplib');

describe('RabbitMqPublisher', () => {
  let channel: {
    assertQueue: jest.Mock;
    sendToQueue: jest.Mock;
    close: jest.Mock;
  };
  let connection: { createChannel: jest.Mock; close: jest.Mock };
  let configMock: { getOrThrow: jest.Mock };
  let publisher: RabbitMqPublisher;

  beforeEach(async () => {
    channel = {
      assertQueue: jest.fn().mockResolvedValue(undefined),
      sendToQueue: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    configMock = { getOrThrow: jest.fn().mockReturnValue('amqp://localhost') };

    publisher = new RabbitMqPublisher(configMock as never);
    await publisher.onModuleInit();
  });

  it('connects using RABBITMQ_URL and opens a channel', () => {
    expect(configMock.getOrThrow).toHaveBeenCalledWith('RABBITMQ_URL');
    expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost');
    expect(connection.createChannel).toHaveBeenCalled();
  });

  it('asserts the queue topology (DLQ + retry cycle) and sends a persistent JSON message', async () => {
    const message = { messageId: '1', payload: { postId: 'p1' } };

    await publisher.publish('moderation.job', message);

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
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'moderation.job',
      Buffer.from(JSON.stringify(message)),
      { persistent: true },
    );
  });

  it('throws if publish is called before the channel is initialized', async () => {
    const uninitialized = new RabbitMqPublisher(configMock as never);

    await expect(uninitialized.publish('moderation.job', {})).rejects.toThrow(
      'RabbitMQ channel not initialized',
    );
  });

  it('closes the channel and connection on module destroy', async () => {
    await publisher.onModuleDestroy();

    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });
});
