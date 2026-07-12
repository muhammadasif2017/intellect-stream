import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '../../lib/api';
import type { LogEntry, LogFilters } from './types';

export function useLogs(filters: LogFilters, enabled: boolean) {
  return useQuery({
    /* Filters in the key: each combination is its own cache entry, and
     * changing a filter refetches without manual invalidation. */
    queryKey: ['logs', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.correlationId) {
        params.set('correlationId', filters.correlationId);
      }
      if (filters.service) params.set('service', filters.service);
      if (filters.level) params.set('level', filters.level);
      const qs = params.toString();
      return apiFetch<LogEntry[]>(`/api/dev/logs${qs ? `?${qs}` : ''}`);
    },
    enabled,
  });
}
