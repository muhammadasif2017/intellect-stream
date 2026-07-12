import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { render, waitFor } from '@testing-library/react';

import { ApiError } from './api';
import { makeQueryClient } from './query';

/* Minimal consumer that fires one failing query — enough to exercise the
 * QueryCache onError wiring without a real page. retryDelay 0 so the
 * default backoff doesn't outlast waitFor. */
function FailingQuery({ queryFn }: { queryFn: () => Promise<unknown> }) {
  useQuery({ queryKey: ['dev-status'], queryFn, retryDelay: 0 });
  return null;
}

function renderWith(
  client: ReturnType<typeof makeQueryClient>,
  ui: ReactElement,
) {
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe('makeQueryClient session eviction', () => {
  it('flips `me` to null on a 401 so AuthGate shows the login screen', async () => {
    const client = makeQueryClient();
    client.setQueryData(['me'], { id: 'u1', email: 'dev@local' });

    renderWith(
      client,
      <FailingQuery
        queryFn={() => Promise.reject(new ApiError(401, 'Unauthorized'))}
      />,
    );

    await waitFor(() => {
      expect(client.getQueryData(['me'])).toBeNull();
    });
  });

  it('leaves the session intact on non-401 errors', async () => {
    const client = makeQueryClient();
    const user = { id: 'u1', email: 'dev@local' };
    client.setQueryData(['me'], user);

    renderWith(
      client,
      <FailingQuery
        queryFn={() => Promise.reject(new ApiError(500, 'boom'))}
      />,
    );

    await waitFor(() => {
      expect(client.getQueryState(['dev-status'])?.status).toBe('error');
    });
    expect(client.getQueryData(['me'])).toEqual(user);
  });

  it('does not retry a 401 — the session stays expired', async () => {
    const client = makeQueryClient();
    const queryFn = vi
      .fn()
      .mockRejectedValue(new ApiError(401, 'Unauthorized'));

    renderWith(client, <FailingQuery queryFn={queryFn} />);

    await waitFor(() => {
      expect(client.getQueryState(['dev-status'])?.status).toBe('error');
    });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('retries non-401 errors once', async () => {
    const client = makeQueryClient();
    const queryFn = vi.fn().mockRejectedValue(new ApiError(500, 'boom'));

    renderWith(client, <FailingQuery queryFn={queryFn} />);

    await waitFor(() => {
      expect(client.getQueryState(['dev-status'])?.status).toBe('error');
    });
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
