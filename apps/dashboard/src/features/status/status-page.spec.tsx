import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { StatusPage } from './status-page';
import type { DevStatusSnapshot } from './types';

const snapshot: DevStatusSnapshot = {
  timestamp: '2026-07-12T10:00:00.000Z',
  services: [
    { service: 'api-gateway', ok: true, uptime: 120 },
    { service: 'content-service', ok: true, uptime: 90 },
    { service: 'ai-processing-service', ok: false, error: 'ECONNREFUSED' },
    { service: 'analytics-service', ok: true, uptime: 60 },
    { service: 'notification-service', ok: true, uptime: 45 },
  ],
  outbox: {
    ok: true,
    pending: 3,
    quarantined: 1,
    published: 42,
    oldestPendingAt: null,
  },
  queues: {
    ok: true,
    queues: [
      {
        name: 'moderation.job.dlq',
        messages: 2,
        messagesReady: 2,
        messagesUnacknowledged: 0,
      },
    ],
  },
};

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          statusText: status === 502 ? 'Bad Gateway' : 'OK',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StatusPage />
    </QueryClientProvider>,
  );
}

describe('StatusPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders service health with up/down badges', async () => {
    stubFetch(200, snapshot);
    renderPage();
    expect(await screen.findByText('ai-processing-service')).toBeTruthy();
    expect(screen.getAllByText('up')).toHaveLength(4);
    expect(screen.getByText('down')).toBeTruthy();
    expect(screen.getByText('ECONNREFUSED')).toBeTruthy();
  });

  it('marks quarantined rows as a danger state', async () => {
    stubFetch(200, snapshot);
    renderPage();
    const quarantined = await screen.findByText('Quarantined');
    expect(quarantined.nextElementSibling?.className).toContain(
      'text-status-failed',
    );
    expect(screen.getByText('needs manual replay')).toBeTruthy();
  });

  it('shows the error state with retry when the gateway is unreachable', async () => {
    stubFetch(502, {});
    renderPage();
    expect(
      await screen.findByText('Could not reach the gateway'),
    ).toBeTruthy();
    expect(screen.getByText('502 Bad Gateway')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
