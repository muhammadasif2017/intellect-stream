import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '../../lib/api';
import type { DevStatusSnapshot } from './types';

const REFRESH_MS = 5_000;

export function useDevStatus() {
  return useQuery({
    queryKey: ['dev-status'],
    queryFn: () => apiFetch<DevStatusSnapshot>('/api/dev/status'),
    /* The page is a monitor: keep polling even when idle. The gateway's
     * probes have their own 2s timeouts, so 5s spacing can't pile up. */
    refetchInterval: REFRESH_MS,
  });
}
