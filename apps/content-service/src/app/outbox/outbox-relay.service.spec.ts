import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { KAFKA_PUBLISHER, PUBLISHER } from '@intellect-stream/shared-messaging';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';

const prismaMock = {
  outboxMessage: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const publisherMock = {
  publish: jest.fn(),
};

const kafkaPublisherMock = {
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
  attempts: 0,
  lastAttemptAt: null,
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
        { provide: KAFKA_PUBLISHER, useValue: kafkaPublisherMock },
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

  it('queries pending rows oldest-first, batch of 20, excluding quarantined rows', async () => {
    prismaMock.outboxMessage.findMany.mockResolvedValue([]);
    await service.poll();
    expect(prismaMock.outboxMessage.findMany).toHaveBeenCalledWith({
      where: { publishedAt: null, attempts: { lt: 10 } },
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

  it('routes a moderation.completed row to the Kafka publisher, not RabbitMQ', async () => {
    const row = {
      ...baseRow,
      id: 'row-kafka',
      eventType: 'moderation.completed',
      payload: { postId: 'post-1', verdict: 'approved', categories: [] },
    };
    prismaMock.outboxMessage.findMany.mockResolvedValue([row]);
    kafkaPublisherMock.publish.mockResolvedValue(undefined);
    prismaMock.outboxMessage.update.mockResolvedValue({ ...row, publishedAt: new Date() });

    await service.poll();

    expect(kafkaPublisherMock.publish).toHaveBeenCalledWith(
      'moderation-completed-events',
      expect.objectContaining({ messageId: row.id, eventType: 'moderation.completed' }),
    );
    expect(publisherMock.publish).not.toHaveBeenCalled();
  });

  it('leaves an unmapped eventType unpublished, logs, and records the attempt', async () => {
    const row = { ...baseRow, id: 'row-2', eventType: 'unknown.event' };
    prismaMock.outboxMessage.findMany.mockResolvedValue([row]);
    prismaMock.outboxMessage.update.mockResolvedValue({ ...row, attempts: 1 });

    await service.poll();

    expect(publisherMock.publish).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('unknown.event'));
    // BUG-0006: the failure is counted so the row eventually stops occupying batch slots
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { attempts: 1, lastAttemptAt: expect.any(Date) },
    });
  });

  it('records the attempt when publish fails, and does not stop the batch', async () => {
    const failing = { ...baseRow, id: 'row-fail' };
    const ok = { ...baseRow, id: 'row-ok' };
    prismaMock.outboxMessage.findMany.mockResolvedValue([failing, ok]);
    publisherMock.publish
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined);
    prismaMock.outboxMessage.update.mockResolvedValue({});

    await service.poll();

    expect(publisherMock.publish).toHaveBeenCalledTimes(2);
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: failing.id },
      data: { attempts: 1, lastAttemptAt: expect.any(Date) },
    });
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: ok.id },
      data: { publishedAt: expect.any(Date) },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('row-fail'),
      expect.any(Error),
    );
  });

  it('logs quarantine when a failure crosses MAX_ATTEMPTS', async () => {
    const row = { ...baseRow, id: 'row-poison', attempts: 9 };
    prismaMock.outboxMessage.findMany.mockResolvedValue([row]);
    publisherMock.publish.mockRejectedValue(new Error('broker rejected payload'));
    prismaMock.outboxMessage.update.mockResolvedValue({ ...row, attempts: 10 });

    await service.poll();

    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { attempts: 10, lastAttemptAt: expect.any(Date) },
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('quarantined after 10'));
  });

  it('does not log quarantine below MAX_ATTEMPTS', async () => {
    const row = { ...baseRow, id: 'row-retry', attempts: 3 };
    prismaMock.outboxMessage.findMany.mockResolvedValue([row]);
    publisherMock.publish.mockRejectedValue(new Error('transient'));
    prismaMock.outboxMessage.update.mockResolvedValue({ ...row, attempts: 4 });

    await service.poll();

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('quarantined'));
  });

  it('continues the batch when attempt bookkeeping itself fails', async () => {
    const failing = { ...baseRow, id: 'row-fail' };
    const ok = { ...baseRow, id: 'row-ok' };
    prismaMock.outboxMessage.findMany.mockResolvedValue([failing, ok]);
    publisherMock.publish
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined);
    prismaMock.outboxMessage.update
      .mockRejectedValueOnce(new Error('db unavailable')) // attempts write for row-fail
      .mockResolvedValueOnce({}); // publishedAt write for row-ok

    await service.poll();

    expect(publisherMock.publish).toHaveBeenCalledTimes(2);
    expect(prismaMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: ok.id },
      data: { publishedAt: expect.any(Date) },
    });
  });
});
