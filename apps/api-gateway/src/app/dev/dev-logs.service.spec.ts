import type { RedisClientType } from 'redis';
import { DevLogsService } from './dev-logs.service';

function makeService(
  rows: Array<{ id: string; message: Record<string, string> }>,
) {
  const redis = {
    xRevRange: jest.fn().mockResolvedValue(rows),
  } as unknown as RedisClientType;
  return new DevLogsService(redis);
}

const row = (
  id: string,
  service: string,
  level: string,
  message: string,
) => ({
  id,
  message: {
    ts: '2026-07-12T10:00:00.000Z',
    level,
    service,
    context: 'Test',
    message,
  },
});

describe('DevLogsService.query', () => {
  const rows = [
    row('3-0', 'content-service', 'warn', 'outbox row quarantined corr-9'),
    row('2-0', 'api-gateway', 'log', 'POST /posts corr-9'),
    row('1-0', 'content-service', 'log', 'post created corr-7'),
  ];

  it('returns newest-first entries mapped from stream fields', async () => {
    const entries = await makeService(rows).query({});
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      id: '3-0',
      service: 'content-service',
      level: 'warn',
      message: 'outbox row quarantined corr-9',
    });
  });

  it('filters by service and level', async () => {
    const entries = await makeService(rows).query({
      service: 'content-service',
      level: 'log',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('1-0');
  });

  it('filters by correlationId as message substring', async () => {
    const entries = await makeService(rows).query({ correlationId: 'corr-9' });
    expect(entries.map((e) => e.id)).toEqual(['3-0', '2-0']);
  });

  it('caps results at the limit', async () => {
    const entries = await makeService(rows).query({ limit: 2 });
    expect(entries).toHaveLength(2);
  });
});
