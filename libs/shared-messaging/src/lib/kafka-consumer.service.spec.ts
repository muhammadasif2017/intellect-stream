import { Logger } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { KafkaConsumer } from './kafka-consumer.service';

jest.mock('kafkajs');

describe('KafkaConsumer', () => {
  let kafkaConsumerMock: {
    connect: jest.Mock;
    subscribe: jest.Mock;
    run: jest.Mock;
    disconnect: jest.Mock;
  };
  let configMock: { getOrThrow: jest.Mock };
  let consumer: KafkaConsumer;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    kafkaConsumerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    (Kafka as unknown as jest.Mock).mockImplementation(() => ({
      consumer: jest.fn().mockReturnValue(kafkaConsumerMock),
    }));
    configMock = { getOrThrow: jest.fn().mockReturnValue('localhost:9092') };
    consumer = new KafkaConsumer(configMock as never, 'analytics-service');
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function getEachMessage() {
    return kafkaConsumerMock.run.mock.calls[0][0].eachMessage as (arg: {
      message: { value: Buffer | null };
    }) => Promise<void>;
  }

  it('connects, subscribes from the current offset (not fromBeginning), and starts consuming', async () => {
    await consumer.consume(
      { topic: 'moderation-completed-events', groupId: 'analytics-service' },
      jest.fn(),
    );

    expect(Kafka).toHaveBeenCalledWith({
      clientId: 'analytics-service',
      brokers: ['localhost:9092'],
    });
    expect(kafkaConsumerMock.connect).toHaveBeenCalled();
    expect(kafkaConsumerMock.subscribe).toHaveBeenCalledWith({
      topic: 'moderation-completed-events',
      fromBeginning: false,
    });
    expect(kafkaConsumerMock.run).toHaveBeenCalledWith({ eachMessage: expect.any(Function) });
  });

  it('parses the envelope JSON and invokes the handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await consumer.consume({ topic: 't', groupId: 'g' }, handler);

    const envelope = { messageId: 'm1', payload: { postId: 'p1' } };
    await getEachMessage()({ message: { value: Buffer.from(JSON.stringify(envelope)) } });

    expect(handler).toHaveBeenCalledWith(envelope);
  });

  it('ignores a message with no value', async () => {
    const handler = jest.fn();
    await consumer.consume({ topic: 't', groupId: 'g' }, handler);

    await getEachMessage()({ message: { value: null } });

    expect(handler).not.toHaveBeenCalled();
  });

  it('logs and does not throw when the handler rejects — no DLQ topic in this design', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    await consumer.consume({ topic: 't', groupId: 'g' }, handler);

    await expect(
      getEachMessage()({ message: { value: Buffer.from(JSON.stringify({})) } }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('t'), expect.any(Error));
  });

  it('logs and skips on invalid JSON instead of throwing', async () => {
    const handler = jest.fn();
    await consumer.consume({ topic: 't', groupId: 'g' }, handler);

    await expect(
      getEachMessage()({ message: { value: Buffer.from('not json') } }),
    ).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('disconnects the consumer on module destroy', async () => {
    await consumer.consume({ topic: 't', groupId: 'g' }, jest.fn());
    await consumer.onModuleDestroy();
    expect(kafkaConsumerMock.disconnect).toHaveBeenCalled();
  });
});
