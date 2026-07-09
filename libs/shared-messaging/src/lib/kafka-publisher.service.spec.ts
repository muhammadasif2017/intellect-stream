import { Kafka } from 'kafkajs';
import { KafkaPublisher } from './kafka-publisher.service';

jest.mock('kafkajs');

describe('KafkaPublisher', () => {
  let producer: { connect: jest.Mock; send: jest.Mock; disconnect: jest.Mock };
  let configMock: { getOrThrow: jest.Mock };
  let publisher: KafkaPublisher;

  beforeEach(async () => {
    producer = {
      connect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    (Kafka as unknown as jest.Mock).mockImplementation(() => ({
      producer: jest.fn().mockReturnValue(producer),
    }));
    configMock = { getOrThrow: jest.fn().mockReturnValue('localhost:9092,other:9093') };

    publisher = new KafkaPublisher(configMock as never, 'content-service');
    await publisher.onModuleInit();
  });

  it('connects using KAFKA_BROKERS (comma-split) and the injected clientId', () => {
    expect(configMock.getOrThrow).toHaveBeenCalledWith('KAFKA_BROKERS');
    expect(Kafka).toHaveBeenCalledWith({
      clientId: 'content-service',
      brokers: ['localhost:9092', 'other:9093'],
    });
    expect(producer.connect).toHaveBeenCalled();
  });

  it('sends a JSON message keyed by payload.postId (ADR-0009 partition key)', async () => {
    const message = { messageId: '1', payload: { postId: 'p1', verdict: 'approved' } };

    await publisher.publish('moderation-completed-events', message);

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'moderation-completed-events',
      messages: [{ key: 'p1', value: JSON.stringify(message) }],
    });
  });

  it('sends with an undefined key when the payload has no postId', async () => {
    const message = { messageId: '1', payload: {} };

    await publisher.publish('some-topic', message);

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'some-topic',
      messages: [{ key: undefined, value: JSON.stringify(message) }],
    });
  });

  it('throws if publish is called before the producer is initialized', async () => {
    const uninitialized = new KafkaPublisher(configMock as never, 'content-service');

    await expect(uninitialized.publish('t', {})).rejects.toThrow(
      'Kafka producer not initialized',
    );
  });

  it('disconnects the producer on module destroy', async () => {
    await publisher.onModuleDestroy();
    expect(producer.disconnect).toHaveBeenCalled();
  });
});
