import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from './app';

/* The auth gate must resolve (logged in) for the shell to render; every
 * other request parks in a permanent pending state so shell tests stay
 * about the shell. */
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('/api/auth/me')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'u1', email: 'dev@local' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return new Promise<Response>(() => undefined);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/* All queries are findBy* — the auth gate resolves the session before the
 * shell renders, so first paint is async in every test. */
describe('App shell', () => {
  it('redirects the root route to /status', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Status' })).toBeTruthy();
  });

  it('renders a nav link for every surface', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    for (const label of ['Status', 'Trigger', 'Logs', 'Trace', 'Analytics']) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it.each([
    ['/trigger', 'Trigger'],
    ['/logs', 'Logs'],
    ['/trace', 'Trace'],
    ['/analytics', 'Analytics'],
  ])('renders the %s page', async (path, heading) => {
    renderAt(path);
    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeTruthy();
  });

  it('renders the kitchen sink from the development nav', async () => {
    renderAt('/kitchen-sink');
    expect(
      await screen.findByRole('heading', { name: 'Kitchen sink' }),
    ).toBeTruthy();
  });

  it('renders a not-found page for unknown routes', async () => {
    renderAt('/nope');
    expect(
      await screen.findByRole('heading', { name: 'Not found' }),
    ).toBeTruthy();
  });
});
