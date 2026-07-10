import { MessageEnvelope } from '@intellect-stream/shared-messaging';
import { ModerationCompletedPayload } from '@intellect-stream/shared-dtos';
import { Prisma } from '../../generated/prisma/client';
import { TrendsService } from './trends.service';

const prismaMock = {
  processedMessage: { create: jest.fn() },
  moderationTrend: { upsert: jest.fn() },
  $transaction: jest.fn(),
};
prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) =>
  cb(prismaMock),
);

const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: '7.8.0',
});

function envelope(
  payload: ModerationCompletedPayload,
): MessageEnvelope<ModerationCompletedPayload> {
  return {
    messageId: 'm1',
    correlationId: 'c1',
    eventType: 'moderation.completed',
    eventVersion: 1,
    occurredAt: '2026-07-09T10:30:00.000Z',
    source: 'content-service',
    payload,
  };
}

describe('TrendsService', () => {
  let consumerMock: { consume: jest.Mock };
  let service: TrendsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock),
    );
    consumerMock = { consume: jest.fn().mockResolvedValue(undefined) };

    service = new TrendsService(consumerMock as never, prismaMock as never);
    await service.onModuleInit();
  });

  function getHandler() {
    return consumerMock.consume.mock.calls[0][1] as (
      e: MessageEnvelope<ModerationCompletedPayload>,
    ) => Promise<void>;
  }

  it('subscribes to moderation-completed-events with the analytics-service group', () => {
    expect(consumerMock.consume).toHaveBeenCalledWith(
      { topic: 'moderation-completed-events', groupId: 'analytics-service' },
      expect.any(Function),
    );
  });

  it('records the message id and increments a trend row per category', async () => {
    await getHandler()(
      envelope({ postId: 'p1', verdict: 'rejected', categories: ['spam', 'hate_speech'] }),
    );

    expect(prismaMock.processedMessage.create).toHaveBeenCalledWith({
      data: { messageId: 'm1' },
    });
    expect(prismaMock.moderationTrend.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.moderationTrend.upsert).toHaveBeenCalledWith({
      where: {
        date_category_verdict: {
          date: new Date('2026-07-09T00:00:00.000Z'),
          category: 'spam',
          verdict: 'rejected',
        },
      },
      create: {
        date: new Date('2026-07-09T00:00:00.000Z'),
        category: 'spam',
        verdict: 'rejected',
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
  });

  it('falls back to the "none" category bucket when categories is empty', async () => {
    await getHandler()(envelope({ postId: 'p1', verdict: 'approved', categories: [] }));

    expect(prismaMock.moderationTrend.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.moderationTrend.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date_category_verdict: expect.objectContaining({ category: 'none', verdict: 'approved' }),
        },
      }),
    );
  });

  it('skips silently on a duplicate delivery (unique constraint violation)', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(duplicateError);

    await expect(
      getHandler()(envelope({ postId: 'p1', verdict: 'approved', categories: [] })),
    ).resolves.toBeUndefined();
  });

  it('rethrows on any other transaction failure', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      getHandler()(envelope({ postId: 'p1', verdict: 'approved', categories: [] })),
    ).rejects.toThrow('connection lost');
  });

  it('rejects a payload that fails validation before touching the database', async () => {
    await expect(
      getHandler()(envelope({ postId: 'p1', verdict: 'maybe' as never, categories: [] })),
    ).rejects.toBeTruthy();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
