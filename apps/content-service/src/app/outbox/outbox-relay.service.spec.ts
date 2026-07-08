import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';
import { PUBLISHER } from './publisher.interface';

const prismaMock = {
  outboxMessage: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const publisherMock = {
  publish: jest.fn(),
};

const baseRow = {
  id: 'row-1',
  correlationId: 'corr-1',
  eventType: 'moderation.job',
  eventVersion: 1,
  source: 'content-service',
  occurredAt: new Date('2026-07-08T00:00:00.000Z'),
  payload: { postId: 'post-1', content: 'hi' },
  publishedAt: null,
};

describe('OutboxRelayService', () => {
  let service: OutboxRelayService;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const module = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PUBLISHER, useValue: publisherMock },
      ],
    }).compile();
    service = module.get(OutboxRelayService);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does nothing when there are no pending rows', async () => {
    prismaMock.outboxMessage.findMany.mockResolvedValue([]);
    await service.poll();
    expect(publisherMock.publish).not.toHaveBeenCalled();
    expect(prismaMock.outboxMessage.update).not.toHaveBeenCalled();
  });

  it('queries pending rows oldest-first, batch of 20', async () => {
    prismaMock.outboxMessage.findMany.mockResolvedValue([]);
    await service.poll();
    expect(prismaMock.outboxMessage.findMany).toHaveBeenCalledWith({
      where: { publishedAt: null },
      take: 20,
      orderBy: { occurredAt: 'asc' },
    });
  });

  it('publishes a pending row with the full envelope, then marks publishedAt', async () => {
    prismaMock.outboxMessage.findMany.mockResolvedValue([baseRow]);
    publisherMock.publish.mockResolvedValue(undefined);
    prismaMock.outboxMessage.update.mockResolvedValue({ ...baseRow, publishedAt: new Date() });

    await service.poll();

    expect(publisherMock.publish).toHaveBeenCalledWith('moderation.job', {
      messageId: baseRow.id,
      correlationId: baseRow.correlationId,
      eventType: baseRow.eventType,
      eventVersion: baseRow.eventVersion,
      occurredAt: baseRow.occurredAt,
      source: baseRow.source,
      payload: baseRow.payload,
    });
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: baseRow.id },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('leaves an unmapped eventType pending and logs instead of silently dropping it', async () => {
    const row = { ...baseRow, id: 'row-2', eventType: 'unknown.event' };
    prismaMock.outboxMessage.findMany.mockResolvedValue([row]);

    await service.poll();

    expect(publisherMock.publish).not.toHaveBeenCalled();
    expect(prismaMock.outboxMessage.update).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('unknown.event'));
  });

  it('leaves the row pending for retry when publish fails, and does not stop the batch', async () => {
    const failing = { ...baseRow, id: 'row-fail' };
    const ok = { ...baseRow, id: 'row-ok' };
    prismaMock.outboxMessage.findMany.mockResolvedValue([failing, ok]);
    publisherMock.publish
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined);
    prismaMock.outboxMessage.update.mockResolvedValue({ ...ok, publishedAt: new Date() });

    await service.poll();

    expect(publisherMock.publish).toHaveBeenCalledTimes(2);
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: ok.id },
      data: { publishedAt: expect.any(Date) },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('row-fail'),
      expect.any(Error),
    );
  });
});
