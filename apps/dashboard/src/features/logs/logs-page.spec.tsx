import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LogsPage } from './logs-page';
import type { LogEntry } from './types';

const entries: LogEntry[] = [
  {
    id: '2-0',
    ts: '2026-07-12T10:00:01.500Z',
    level: 'warn',
    service: 'content-service',
    context: 'OutboxRelay',
    message: 'outbox row quarantined corr-9',
  },
  {
    id: '1-0',
    ts: '2026-07-12T10:00:00.000Z',
    level: 'log',
    service: 'api-gateway',
    context: 'PostsProxy',
    message: 'POST /posts corr-9',
  },
];

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
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
      <LogsPage />
    </QueryClientProvider>,
  );
}

describe('LogsPage', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders queried log entries', async () => {
    stubFetch(entries);
    renderPage();
    expect(
      await screen.findByText('outbox row quarantined corr-9'),
    ).toBeTruthy();
    expect(screen.getByText('POST /posts corr-9')).toBeTruthy();
  });

  it('shows an empty state when nothing matches', async () => {
    stubFetch([]);
    renderPage();
    expect(await screen.findByText('No matching logs')).toBeTruthy();
  });

  it('go-live opens the stream and appends pushed entries', async () => {
    stubFetch([]);
    renderPage();
    await screen.findByText('No matching logs');

    await userEvent.click(screen.getByRole('button', { name: 'Go live' }));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain('/api/dev/logs/stream');

    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify(entries[0]),
      });
    });
    expect(
      await screen.findByText('outbox row quarantined corr-9'),
    ).toBeTruthy();
  });

  it('closes the stream when live mode is toggled off', async () => {
    stubFetch([]);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Go live' }));
    await userEvent.click(screen.getByRole('button', { name: '● Live' }));
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('shows a reconnect banner when the stream errors', async () => {
    stubFetch([]);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Go live' }));
    act(() => {
      FakeEventSource.instances[0].onerror?.();
    });
    expect(
      await screen.findByText('Stream interrupted — reconnecting…'),
    ).toBeTruthy();
  });
});
