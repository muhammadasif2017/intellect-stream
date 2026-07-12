import { useCallback, useState } from 'react';

import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../components';
import { cn } from '../../lib/cn';
import { gatewayBaseUrl } from '../../lib/api';
import { useSse } from '../../lib/use-sse';
import { LEVELS, matchesFilters, SERVICES } from './types';
import type { LogEntry, LogFilters } from './types';
import { useLogs } from './use-logs';

const LIVE_BUFFER = 500;

/* Levels color the level word only — a fully red row shouts louder than
 * the data deserves; the eye scans the level column for trouble. */
const levelClass: Record<string, string> = {
  error: 'text-status-failed font-medium',
  fatal: 'text-status-failed font-semibold',
  warn: 'text-status-pending font-medium',
  debug: 'text-muted-foreground',
  verbose: 'text-muted-foreground',
};

export function LogsPage() {
  const [filters, setFilters] = useState<LogFilters>({
    correlationId: '',
    service: '',
    level: '',
  });
  const [live, setLive] = useState(false);
  const [liveEntries, setLiveEntries] = useState<LogEntry[]>([]);

  const query = useLogs(filters, !live);

  const onStreamEntry = useCallback((entry: LogEntry) => {
    setLiveEntries((prev) => [entry, ...prev].slice(0, LIVE_BUFFER));
  }, []);
  const sse = useSse<LogEntry>(
    live ? `${gatewayBaseUrl}/api/dev/logs/stream` : null,
    onStreamEntry,
  );

  const toggleLive = () => {
    setLiveEntries([]);
    setLive((prev) => !prev);
  };

  /* Live mode filters client-side — the stream carries everything, and
   * re-subscribing per filter change would drop entries mid-look. */
  const entries = live
    ? liveEntries.filter((e) => matchesFilters(e, filters))
    : (query.data ?? []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Structured logs from all five services, via the Redis Stream sink.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <label
            htmlFor="filter-correlation"
            className="mb-1.5 block text-sm font-medium"
          >
            Correlation ID
          </label>
          <Input
            id="filter-correlation"
            className="font-mono"
            placeholder="paste from Trigger"
            value={filters.correlationId}
            onChange={(e) =>
              setFilters((f) => ({ ...f, correlationId: e.target.value }))
            }
          />
        </div>
        <div className="w-52">
          <label
            htmlFor="filter-service"
            className="mb-1.5 block text-sm font-medium"
          >
            Service
          </label>
          <Select
            id="filter-service"
            value={filters.service}
            onChange={(e) =>
              setFilters((f) => ({ ...f, service: e.target.value }))
            }
          >
            <option value="">All services</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <label
            htmlFor="filter-level"
            className="mb-1.5 block text-sm font-medium"
          >
            Level
          </label>
          <Select
            id="filter-level"
            value={filters.level}
            onChange={(e) =>
              setFilters((f) => ({ ...f, level: e.target.value }))
            }
          >
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant={live ? 'primary' : 'secondary'}
          onClick={toggleLive}
        >
          {live ? '● Live' : 'Go live'}
        </Button>
      </div>

      {live && sse.status === 'error' && (
        <p
          role="status"
          className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700"
        >
          Stream interrupted — reconnecting…
        </p>
      )}

      <div className="mt-6">
        {!live && query.isPending && <LogsSkeleton />}
        {!live && query.isError && (
          <ErrorState
            title="Could not load logs"
            detail={query.error.message}
            onRetry={() => query.refetch()}
          />
        )}
        {(live || query.isSuccess) && entries.length === 0 ? (
          <EmptyState
            title={live ? 'Waiting for log entries…' : 'No matching logs'}
            description={
              live
                ? 'Fire a post from the Trigger page and entries appear here in real time.'
                : 'Loosen the filters, or set LOG_SINK=redis on the services and fire a post.'
            }
          />
        ) : (
          (live || query.isSuccess) && (
            <Table>
              <THead>
                <Tr>
                  <Th className="w-24">Time</Th>
                  <Th className="w-16">Level</Th>
                  <Th className="w-44">Service</Th>
                  <Th>Message</Th>
                </Tr>
              </THead>
              <TBody>
                {entries.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                      {entry.ts.slice(11, 23)}
                    </Td>
                    <Td
                      className={cn(
                        'font-mono text-xs',
                        levelClass[entry.level],
                      )}
                    >
                      {entry.level}
                    </Td>
                    <Td className="font-mono text-xs">
                      <span className="block truncate" title={entry.service}>
                        {entry.service}
                      </span>
                      {entry.context && (
                        <span className="block truncate text-muted-foreground">
                          {entry.context}
                        </span>
                      )}
                    </Td>
                    <Td className="font-mono text-xs break-all">
                      {entry.message}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )
        )}
      </div>
    </div>
  );
}

function LogsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
