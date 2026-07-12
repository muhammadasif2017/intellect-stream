import { ConsoleLogger } from '@nestjs/common';
import {
  createServiceLogger,
  LOG_STREAM_KEY,
  RedisStreamLogger,
  type SinkClient,
} from './redis-stream-logger';

function makeFakeClient(overrides: Partial<SinkClient> = {}) {
  const xAdd = jest.fn().mockResolvedValue('1-1');
  const client: SinkClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    xAdd,
    on: jest.fn(),
    ...overrides,
  };
  return { client, xAdd: xAdd as jest.Mock };
}

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe('RedisStreamLogger', () => {
  beforeEach(() => {
    // Silence the ConsoleLogger side — the sink is what's under test.
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('XADDs entries with level, service, context, and message', async () => {
    const { client, xAdd } = makeFakeClient();
    const logger = new RedisStreamLogger('content-service', { client });
    await flushMicrotasks();

    logger.warn('outbox row quarantined', 'OutboxRelay');

    expect(xAdd).toHaveBeenCalledWith(
      LOG_STREAM_KEY,
      '*',
      expect.objectContaining({
        level: 'warn',
        service: 'content-service',
        context: 'OutboxRelay',
        message: 'outbox row quarantined',
      }),
      expect.objectContaining({ TRIM: expect.anything() }),
    );
  });

  it('buffers entries logged before the connection resolves', async () => {
    let resolveConnect!: () => void;
    const { client, xAdd } = makeFakeClient({
      connect: jest.fn(
        () => new Promise<void>((resolve) => (resolveConnect = resolve)),
      ),
    });
    const logger = new RedisStreamLogger('api-gateway', { client });

    logger.log('booting', 'Bootstrap');
    expect(xAdd).not.toHaveBeenCalled();

    resolveConnect();
    await flushMicrotasks();

    expect(xAdd).toHaveBeenCalledTimes(1);
    expect(xAdd.mock.calls[0][2]).toMatchObject({ message: 'booting' });
  });

  it('disables the sink silently when the connection fails', async () => {
    const { client, xAdd } = makeFakeClient({
      connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const logger = new RedisStreamLogger('api-gateway', { client });
    await flushMicrotasks();

    expect(() => logger.log('still fine')).not.toThrow();
    expect(xAdd).not.toHaveBeenCalled();
  });

  it('swallows write failures — logging must never throw', async () => {
    const { client } = makeFakeClient({
      xAdd: jest.fn().mockRejectedValue(new Error('stream gone')),
    });
    const logger = new RedisStreamLogger('api-gateway', { client });
    await flushMicrotasks();

    expect(() => logger.error('boom')).not.toThrow();
    await flushMicrotasks();
  });

  it('serializes non-string messages', async () => {
    const { client, xAdd } = makeFakeClient();
    const logger = new RedisStreamLogger('api-gateway', { client });
    await flushMicrotasks();

    logger.log({ event: 'published', id: 42 });

    expect(xAdd.mock.calls[0][2].message).toBe(
      '{"event":"published","id":42}',
    );
  });
});

describe('createServiceLogger', () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it('returns a plain ConsoleLogger unless LOG_SINK=redis', () => {
    process.env = { ...env, LOG_SINK: undefined };
    const logger = createServiceLogger('api-gateway');
    expect(logger).toBeInstanceOf(ConsoleLogger);
    expect(logger).not.toBeInstanceOf(RedisStreamLogger);
  });
});
