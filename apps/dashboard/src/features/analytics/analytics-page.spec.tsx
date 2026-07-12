import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { AnalyticsPage } from './analytics-page';

function stubFetch(trends: unknown, logs: unknown = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: RequestInfo | URL) => {
      const body = String(url).includes('/api/dev/trends') ? trends : logs;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsPage />
    </QueryClientProvider>,
  );
}

describe('AnalyticsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders stat tiles from trend rows', async () => {
    stubFetch([
      { date: '2026-07-12T00:00:00.000Z', category: 'none', verdict: 'approved', count: 6 },
      { date: '2026-07-12T00:00:00.000Z', category: 'S1', verdict: 'rejected', count: 2 },
    ]);
    renderPage();

    expect(await screen.findByText('Posts moderated')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('shows the empty state before any moderation happened', async () => {
    stubFetch([]);
    renderPage();
    expect(await screen.findByText('No moderation data yet')).toBeTruthy();
  });
});
