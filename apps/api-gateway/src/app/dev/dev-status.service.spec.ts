import { ConfigService } from '@nestjs/config';
import { InternalTokenService } from '../auth/internal-token.service';
import { DevStatusService } from './dev-status.service';

const ENV: Record<string, unknown> = {
  CONTENT_SERVICE_URL: 'http://content:3001',
  AI_SERVICE_URL: 'http://ai:3002',
  ANALYTICS_SERVICE_URL: 'http://analytics:3003',
  NOTIFICATION_SERVICE_URL: 'http://notification:3004',
  RABBITMQ_MGMT_URL: 'http://rabbit:15672',
  RABBITMQ_MGMT_USER: 'guest',
  RABBITMQ_MGMT_PASS: 'guest',
};

function makeService() {
  const config = {
    getOrThrow: jest.fn((key: string) => ENV[key]),
    get: jest.fn((key: string) => ENV[key]),
  } as unknown as ConfigService;
  const internalToken = {
    mint: jest.fn().mockReturnValue('signed-token'),
  } as unknown as InternalTokenService;
  return new DevStatusService(config, internalToken);
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('DevStatusService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('aggregates health, outbox, and queues into one snapshot', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const target = String(url);
      if (target.includes('/api/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok', uptime: 42 }));
      }
      if (target.includes('/api/dev/outbox-stats')) {
        return Promise.resolve(
          jsonResponse({
            pending: 1,
            quarantined: 0,
            published: 9,
            oldestPendingAt: null,
          }),
        );
      }
      if (target.includes('/api/queues')) {
        return Promise.resolve(
          jsonResponse([
            {
              name: 'moderation.job',
              messages: 3,
              messages_ready: 2,
              messages_unacknowledged: 1,
            },
          ]),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${target}`));
    });

    const snapshot = await makeService().snapshot();

    expect(snapshot.services).toHaveLength(5);
    expect(snapshot.services[0]).toMatchObject({
      service: 'api-gateway',
      ok: true,
    });
    expect(snapshot.services.slice(1).every((s) => s.ok)).toBe(true);
    expect(snapshot.outbox).toMatchObject({ ok: true, pending: 1 });
    expect(snapshot.queues).toMatchObject({
      ok: true,
      queues: [
        {
          name: 'moderation.job',
          messages: 3,
          messagesReady: 2,
          messagesUnacknowledged: 1,
        },
      ],
    });
  });

  it('reports a dead probe inline instead of failing the snapshot', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const target = String(url);
      if (target.startsWith('http://content:3001')) {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      if (target.includes('/api/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok', uptime: 1 }));
      }
      if (target.includes('/api/queues')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.reject(new Error(`unexpected fetch: ${target}`));
    });

    const snapshot = await makeService().snapshot();

    const content = snapshot.services.find(
      (s) => s.service === 'content-service',
    );
    expect(content).toMatchObject({ ok: false, error: 'ECONNREFUSED' });
    expect(snapshot.outbox.ok).toBe(false);
    expect(snapshot.queues.ok).toBe(true);
  });

  it('sends the gateway-minted internal token to the outbox endpoint', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ status: 'ok' }));

    await makeService().snapshot();

    const outboxCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/dev/outbox-stats'),
    );
    expect(outboxCall?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer signed-token',
    });
  });
});
