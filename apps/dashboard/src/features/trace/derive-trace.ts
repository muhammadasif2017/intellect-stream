import type { LogEntry } from '../logs/types';

export type StageStatus = 'pending' | 'done' | 'error';

interface StageDef {
  key: string;
  label: string;
  detail: string;
  match: (entry: LogEntry) => boolean;
}

export interface TraceStage {
  key: string;
  label: string;
  detail: string;
  status: StageStatus;
  entries: LogEntry[];
  startedAt?: number;
  /* ms since the previous reached stage — the pipeline's per-hop cost. */
  latencyMs?: number;
}

/* The pipeline's happy path, in order. Stages are identified by which
 * service+context produced the stage-marker log line (T18) — the trace is
 * derived entirely from logs, no dedicated tracing infrastructure. */
const STAGES: StageDef[] = [
  {
    key: 'gateway',
    label: 'Gateway',
    detail: 'api-gateway · session, rate limit, proxy',
    match: (e) =>
      e.service === 'api-gateway' && e.context === 'PostsProxyService',
  },
  {
    key: 'post-created',
    label: 'Post created',
    detail: 'content-service · post + outbox row, one transaction',
    match: (e) => e.service === 'content-service' && e.context === 'PostsService',
  },
  {
    key: 'job-published',
    label: 'Job → RabbitMQ',
    detail: 'content-service · outbox relay',
    match: (e) =>
      e.service === 'content-service' &&
      e.context === 'OutboxRelayService' &&
      e.message.includes('rabbitmq'),
  },
  {
    key: 'ai-verdict',
    label: 'AI verdict',
    detail: 'ai-processing-service · Cloudflare Workers AI',
    match: (e) => e.service === 'ai-processing-service',
  },
  {
    key: 'verdict-applied',
    label: 'Verdict applied',
    detail: 'content-service · post status updated',
    match: (e) =>
      e.service === 'content-service' &&
      e.context === 'ModerationCompletedConsumerService',
  },
  {
    key: 'result-published',
    label: 'Result → Kafka',
    detail: 'content-service · outbox relay',
    match: (e) =>
      e.service === 'content-service' &&
      e.context === 'OutboxRelayService' &&
      e.message.includes('kafka'),
  },
  {
    key: 'analytics',
    label: 'Analytics',
    detail: 'analytics-service · trend aggregation',
    match: (e) => e.service === 'analytics-service',
  },
  {
    key: 'notification',
    label: 'Notification',
    detail: 'notification-service · WebSocket push',
    match: (e) => e.service === 'notification-service',
  },
];

export function deriveTrace(entries: LogEntry[]): TraceStage[] {
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  let previousStart: number | undefined;

  return STAGES.map((def) => {
    const matched = sorted.filter(def.match);
    const hasError = matched.some(
      (e) => e.level === 'error' || e.level === 'fatal',
    );
    const startedAt = matched[0] ? Date.parse(matched[0].ts) : undefined;
    const latencyMs =
      startedAt !== undefined && previousStart !== undefined
        ? Math.max(0, startedAt - previousStart)
        : undefined;
    if (startedAt !== undefined) previousStart = startedAt;

    return {
      key: def.key,
      label: def.label,
      detail: def.detail,
      status: matched.length === 0 ? 'pending' : hasError ? 'error' : 'done',
      entries: matched,
      startedAt,
      latencyMs,
    };
  });
}

/* Complete = final stage reached or something failed — either way, stop
 * polling. Kafka's two consumers (analytics, notification) race, so
 * "final" means both tail stages present. */
export function isTraceSettled(stages: TraceStage[]): boolean {
  if (stages.some((s) => s.status === 'error')) return true;
  return stages.every((s) => s.status === 'done');
}

export function totalDurationMs(stages: TraceStage[]): number | undefined {
  const started = stages.filter((s) => s.startedAt !== undefined);
  if (started.length < 2) return undefined;
  return (
    Math.max(...started.map((s) => s.startedAt as number)) -
    Math.min(...started.map((s) => s.startedAt as number))
  );
}
