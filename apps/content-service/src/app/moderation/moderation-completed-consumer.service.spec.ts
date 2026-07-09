import { MessageEnvelope } from '@intellect-stream/shared-messaging';
import { ModerationCompletedPayload } from '@intellect-stream/shared-dtos';
import { Prisma } from '../../generated/prisma/client';
import { ModerationCompletedConsumerService } from './moderation-completed-consumer.service';

const prismaMock = {
  processedMessage: { create: jest.fn() },
  post: { update: jest.fn() },
  outboxMessage: { create: jest.fn() },
  $transaction: jest.fn(),
};
prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) =>
  cb(prismaMock),
);

const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: '7.8.0',
});

const envelope: MessageEnvelope<ModerationCompletedPayload> = {
  messageId: 'm1',
  correlationId: 'c1',
  eventType: 'moderation.completed',
  eventVersion: 1,
  occurredAt: new Date().toISOString(),
  source: 'ai-processing-service',
  payload: { postId: 'p1', verdict: 'approved', categories: [] },
};

describe('ModerationCompletedConsumerService', () => {
  let consumerMock: { consume: jest.Mock };
  let service: ModerationCompletedConsumerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock),
    );
    consumerMock = { consume: jest.fn().mockResolvedValue(undefined) };

    service = new ModerationCompletedConsumerService(
      consumerMock as never,
      prismaMock as never,
    );
    await service.onModuleInit();
  });

  function getHandler() {
    return consumerMock.consume.mock.calls[0][1] as (
      e: MessageEnvelope<ModerationCompletedPayload>,
    ) => Promise<void>;
  }

  it('subscribes to the moderation.completed queue', () => {
    expect(consumerMock.consume).toHaveBeenCalledWith(
      { queue: 'moderation.completed' },
      expect.any(Function),
    );
  });

  it('records the message id and updates the post status in one transaction', async () => {
    await getHandler()(envelope);

    expect(prismaMock.processedMessage.create).toHaveBeenCalledWith({
      data: { messageId: 'm1' },
    });
    expect(prismaMock.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'approved' },
    });
  });

  it('writes an outbox row for the Kafka relay, carrying the correlationId forward', async () => {
    await getHandler()(envelope);

    expect(prismaMock.outboxMessage.create).toHaveBeenCalledWith({
      data: {
        correlationId: 'c1',
        eventType: 'moderation.completed',
        source: 'content-service',
        payload: { postId: 'p1', verdict: 'approved', categories: [] },
      },
    });
  });

  it('skips silently on a duplicate delivery (unique constraint violation)', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(duplicateError);

    await expect(getHandler()(envelope)).resolves.toBeUndefined();
  });

  it('rethrows on any other transaction failure', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('connection lost'));

    await expect(getHandler()(envelope)).rejects.toThrow('connection lost');
  });

  it('rejects a payload that fails validation before touching the database', async () => {
    const invalid: MessageEnvelope<ModerationCompletedPayload> = {
      ...envelope,
      payload: { postId: 'p1', verdict: 'maybe' as never, categories: [] },
    };

    await expect(getHandler()(invalid)).rejects.toBeTruthy();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
