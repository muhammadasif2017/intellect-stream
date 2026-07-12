import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { ApiError } from './api';

/* The canonical `me` key lives in features/auth, but lib/ must not import
 * from features/ — the literal is duplicated on purpose (the logout
 * predicate in use-auth does the same). */
const ME_KEY = ['me'] as const;

/* A 401 on any request after login means the session cookie expired
 * server-side. Flip `me` to null so AuthGate swaps to the login screen.
 *
 * Deliberately ONLY that — no removeQueries here. Removing a query that
 * still has a mounted observer makes React Query re-create and refetch it
 * immediately, which 401s again → remove → refetch: a request loop against
 * the gateway until AuthGate unmounts the page. The dead session's cached
 * data is purged on the next login instead (see useLogin in use-auth). */
function evictExpiredSession(client: QueryClient, error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  client.setQueryData(ME_KEY, null);
}

/* Dashboard data is live: short staleTime keeps views fresh without
 * hammering the gateway; single retry because a dev stack that's down
 * stays down — fail fast into ErrorState instead of spinning. */
export function makeQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    /* The `me` query is excluded from session eviction: it maps 401 → null
     * internally (anonymous is data there, not an error), and evicting on
     * its own 401 would loop the cache-clear on every anonymous visit. */
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] === ME_KEY[0]) return;
        evictExpiredSession(client, error);
      },
    }),
    /* Mutations too: a stale-session POST must kick back to login, not
     * strand the user on an error state. A failed login's own 401 passes
     * through harmlessly — `me` is already null while anonymous. */
    mutationCache: new MutationCache({
      onError: (error) => evictExpiredSession(client, error),
    }),
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        /* Don't burn the single retry on a 401 — an expired session stays
         * expired; retrying only delays the redirect to login. */
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status === 401) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: true,
      },
    },
  });
  return client;
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
