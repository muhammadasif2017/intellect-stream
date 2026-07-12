import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { TracePage } from './trace-page';

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

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TracePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TracePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prompts for an ID when none is in the URL', () => {
    stubFetch([]);
    renderAt('/trace');
    expect(screen.getByText('No correlation ID yet')).toBeTruthy();
  });

  it('renders the stage timeline from correlated logs', async () => {
    stubFetch([
      {
        id: '1-0',
        ts: '2026-07-12T10:00:00.000Z',
        level: 'log',
        service: 'api-gateway',
        context: 'PostsProxyService',
        message: 'POST /posts forwarded, upstream 201 correlationId=c1',
      },
      {
        id: '2-0',
        ts: '2026-07-12T10:00:00.080Z',
        level: 'log',
        service: 'content-service',
        context: 'PostsService',
        message: 'Post p1 created, outbox row written correlationId=c1',
      },
    ]);
    renderAt('/trace?correlationId=c1');

    expect(await screen.findByText('Gateway')).toBeTruthy();
    expect(screen.getByText('Post created')).toBeTruthy();
    expect(screen.getByText('+80ms')).toBeTruthy();
    expect(
      screen.getByText('Message in flight — refreshing every 2s…'),
    ).toBeTruthy();
  });

  it('shows the empty state when the ID has no entries', async () => {
    stubFetch([]);
    renderAt('/trace?correlationId=ghost');
    expect(
      await screen.findByText('No log entries for this ID'),
    ).toBeTruthy();
  });
});
