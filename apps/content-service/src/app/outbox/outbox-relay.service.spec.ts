import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { KAFKA_PUBLISHER, PUBLISHER } from '@intellect-stream/shared-messaging';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';

// poll() claims its batch inside an interactive transaction; the tx client is
// what the service reads and writes through.
const txMock = {
  $queryRaw: jest.fn(),
  outboxMessage: {
    update: jest.fn(),
  },
};

const prismaMock = {
  $transaction: jest.fn(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)),
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
  attempts: 0,
};

function claimSql(): string {
  const [strings] = txMock.$queryRaw.mock.calls[0];
  return (strings as TemplateStringsArray).join(' ');
}

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
    txMock.$queryRaw.mockResolvedValue([]);
    await service.poll();
    expect(publisherMock.publish).not.toHaveBeenCalled();
    expect(txMock.outboxMessage.update).not.toHaveBeenCalled();
  });

  it('claims the batch with SKIP LOCKED, excluding published and quarantined rows', async () => {
    txMock.$queryRaw.mockResolvedValue([]);
    await service.poll();

    const sql = claimSql();
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('"publishedAt" IS NULL');
    expect(sql).toContain('"attempts" <');
    expect(sql).toContain('ORDER BY "occurredAt" ASC');
    // MAX_ATTEMPTS and BATCH_SIZE travel as bind parameters
    expect(txMock.$queryRaw.mock.calls[0].slice(1)).toEqual([10, 20]);
    // lock-holding transaction gets an explicit timeout above Prisma's 5s default
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
    });
  });

  it('publishes a claimed row with the full envelope, then marks publishedAt', async () => {
    txMock.$queryRaw.mockResolvedValue([baseRow]);
    publisherMock.publish.mockResolvedValue(undefined);
    txMock.outboxMessage.update.mockResolvedValue({});

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
    expect(txMock.outboxMessage.update).toHaveBeenCalledWith({
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
    txMock.$queryRaw.mockResolvedValue([row]);
    kafkaPublisherMock.publish.mockResolvedValue(undefined);
    txMock.outboxMessage.update.mockResolvedValue({});

    await service.poll();

    expect(kafkaPublisherMock.publish).toHaveBeenCalledWith(
      'moderation-completed-events',
      expect.objectContaining({ messageId: row.id, eventType: 'moderation.completed' }),
    );
    expect(publisherMock.publish).not.toHaveBeenCalled();
  });

  it('leaves an unmapped eventType unpublished, logs, and records the attempt', async () => {
    const row = { ...baseRow, id: 'row-2', eventType: 'unknown.event' };
    txMock.$queryRaw.mockResolvedValue([row]);
    txMock.outboxMessage.update.mockResolvedValue({});

    await service.poll();

    expect(publisherMock.publish).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('unknown.event'));
    // BUG-0006: the failure is counted so the row eventually stops occupying batch slots
    expect(txMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { attempts: 1, lastAttemptAt: expect.any(Date) },
    });
  });

  it('records the attempt when publish fails, and does not stop the batch', async () => {
    const failing = { ...baseRow, id: 'row-fail' };
    const ok = { ...baseRow, id: 'row-ok' };
    txMock.$queryRaw.mockResolvedValue([failing, ok]);
    publisherMock.publish
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined);
    txMock.outboxMessage.update.mockResolvedValue({});

    await service.poll();

    expect(publisherMock.publish).toHaveBeenCalledTimes(2);
    expect(txMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: failing.id },
      data: { attempts: 1, lastAttemptAt: expect.any(Date) },
    });
    expect(txMock.outboxMessage.update).toHaveBeenCalledWith({
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
    txMock.$queryRaw.mockResolvedValue([row]);
    publisherMock.publish.mockRejectedValue(new Error('broker rejected payload'));
    txMock.outboxMessage.update.mockResolvedValue({});

    await service.poll();

    expect(txMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { attempts: 10, lastAttemptAt: expect.any(Date) },
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('quarantined after 10'));
  });

  it('does not log quarantine below MAX_ATTEMPTS', async () => {
    const row = { ...baseRow, id: 'row-retry', attempts: 3 };
    txMock.$queryRaw.mockResolvedValue([row]);
    publisherMock.publish.mockRejectedValue(new Error('transient'));
    txMock.outboxMessage.update.mockResolvedValue({});

    await service.poll();

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('quarantined'));
  });

  it('logs and swallows a transaction-level failure instead of rejecting the interval', async () => {
    const row = { ...baseRow, id: 'row-fail' };
    txMock.$queryRaw.mockResolvedValue([row]);
    publisherMock.publish.mockRejectedValue(new Error('connection refused'));
    // attempts bookkeeping fails at the DB level → whole tx aborts and rolls back
    txMock.outboxMessage.update.mockRejectedValue(new Error('db unavailable'));

    await expect(service.poll()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('batch rolled back'),
      expect.any(Error),
    );
  });
});
