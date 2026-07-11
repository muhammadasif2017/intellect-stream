import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from './app';

/* Real pages fetch on mount — park them in a permanent pending state so
 * shell tests stay about the shell. */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
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

describe('App shell', () => {
  it('redirects the root route to /status', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Status' })).toBeTruthy();
  });

  it('renders a nav link for every surface', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const label of ['Status', 'Trigger', 'Logs', 'Trace', 'Analytics']) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it.each([
    ['/trigger', 'Trigger'],
    ['/logs', 'Logs'],
    ['/trace', 'Trace'],
    ['/analytics', 'Analytics'],
  ])('renders the %s page', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
  });

  it('renders the kitchen sink from the development nav', () => {
    renderAt('/kitchen-sink');
    expect(screen.getByRole('heading', { name: 'Kitchen sink' })).toBeTruthy();
  });

  it('renders a not-found page for unknown routes', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeTruthy();
  });
});
