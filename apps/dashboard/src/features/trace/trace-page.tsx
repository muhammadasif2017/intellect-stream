import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '../../components';
import { apiFetch } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { LogEntry } from '../logs/types';
import {
  deriveTrace,
  isTraceSettled,
  totalDurationMs,
} from './derive-trace';
import type { TraceStage } from './derive-trace';

const POLL_MS = 2_000;

export function TracePage() {
  const [params, setParams] = useSearchParams();
  const correlationId = params.get('correlationId') ?? '';
  const [draft, setDraft] = useState(correlationId);

  const query = useQuery({
    queryKey: ['trace', correlationId],
    queryFn: () =>
      apiFetch<LogEntry[]>(
        `/api/dev/logs?correlationId=${encodeURIComponent(correlationId)}&limit=1000`,
      ),
    enabled: correlationId !== '',
    /* Poll while the message is still traveling; stop once the chain is
     * settled — done or failed, there is nothing more to watch. */
    refetchInterval: (q) =>
      q.state.data && isTraceSettled(deriveTrace(q.state.data))
        ? false
        : POLL_MS,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setParams(draft ? { correlationId: draft.trim() } : {});
  };

  const stages = query.data ? deriveTrace(query.data) : [];
  const settled = query.data ? isTraceSettled(stages) : false;
  const duration = query.data ? totalDurationMs(stages) : undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Trace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        One correlation ID, followed through every pipeline stage.
      </p>

      <form onSubmit={submit} className="mt-6 flex max-w-xl items-end gap-3">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="trace-correlation"
            className="mb-1.5 block text-sm font-medium"
          >
            Correlation ID
          </label>
          <Input
            id="trace-correlation"
            className="font-mono"
            placeholder="paste from Trigger, or fire a post there first"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <Button type="submit">Trace</Button>
      </form>

      <div className="mt-8">
        {!correlationId && (
          <EmptyState
            title="No correlation ID yet"
            description="Fire a post from the Trigger page — its Trace link lands here with the ID filled in."
          />
        )}

        {correlationId && query.isPending && <TraceSkeleton />}

        {correlationId && query.isError && (
          <ErrorState
            title="Could not load the trace"
            detail={query.error.message}
            onRetry={() => query.refetch()}
          />
        )}

        {query.isSuccess && query.data.length === 0 && (
          <EmptyState
            title="No log entries for this ID"
            description="Either the post hasn't been fired yet, or the services are running without LOG_SINK=redis."
          />
        )}

        {query.isSuccess && query.data.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground" role="status">
              {settled
                ? duration !== undefined
                  ? `Chain settled in ${formatMs(duration)}.`
                  : 'Chain settled.'
                : 'Message in flight — refreshing every 2s…'}
            </p>
            <ol className="mt-4">
              {stages.map((stage, index) => (
                <StageRow
                  key={stage.key}
                  stage={stage}
                  isLast={index === stages.length - 1}
                />
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

const dotByStatus = {
  done: 'bg-status-delivered',
  error: 'bg-status-failed',
  pending: 'border-2 border-border bg-surface',
} as const;

function StageRow({ stage, isLast }: { stage: TraceStage; isLast: boolean }) {
  const pending = stage.status === 'pending';
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      {/* Connector line, drawn per-row so it stops at the last stage. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-4 left-[7px] h-full w-px bg-border"
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative mt-1 size-[15px] shrink-0 rounded-full',
          dotByStatus[stage.status],
        )}
      />
      <div className={cn('min-w-0 flex-1', pending && 'opacity-50')}>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <p className="text-sm font-medium">{stage.label}</p>
          {stage.latencyMs !== undefined && (
            <span className="font-mono text-xs text-muted-foreground">
              +{formatMs(stage.latencyMs)}
            </span>
          )}
          {stage.status === 'error' && (
            <span className="text-xs font-medium text-status-failed">
              failed
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{stage.detail}</p>
        {stage.entries.length > 0 && (
          <ul className="mt-2 space-y-1">
            {stage.entries.map((entry) => (
              <li
                key={entry.id}
                className="font-mono text-xs break-all text-muted-foreground"
              >
                {entry.ts.slice(11, 23)} {entry.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function TraceSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
