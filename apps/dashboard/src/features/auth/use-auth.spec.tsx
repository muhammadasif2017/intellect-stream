import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useLogin } from './use-auth';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useLogin', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('purges the previous session cache and sets `me` on success', async () => {
    const user = { id: 'u1', email: 'dev@local' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, user)));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    /* Leftovers from an expired session — a fresh login must not serve them. */
    client.setQueryData(['me'], null);
    client.setQueryData(['posts'], [{ id: 'stale' }]);

    const { result } = renderHook(() => useLogin(), {
      wrapper: makeWrapper(client),
    });
    result.current.mutate({ email: 'dev@local', password: 'pw' });

    await waitFor(() => {
      expect(client.getQueryData(['me'])).toEqual(user);
    });
    expect(client.getQueryData(['posts'])).toBeUndefined();
  });
});
