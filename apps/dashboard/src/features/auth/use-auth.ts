import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '../../lib/api';

export interface User {
  id: string;
  email: string;
}

const ME_KEY = ['me'] as const;

/* null = "not logged in" — a data value, not an error. Only real failures
 * (gateway down, 500) reach the error state; a 401 is the normal anonymous
 * case and must not render an ErrorState. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        return await apiFetch<User>('/api/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<User>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    /* Register doesn't create a session — chain the login so "create
     * account" lands the user inside the app, not on a second form. */
    mutationFn: async (input: { email: string; password: string }) => {
      await apiFetch<User>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return apiFetch<User>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
    /* Clear everything, not just `me` — cached dev-status/posts belong to
     * the ended session. */
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}
