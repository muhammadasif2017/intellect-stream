/* Mirrors api-gateway's DevStatusSnapshot (dev-status.service.ts).
 * Kept as a hand-written mirror: the dashboard is the only consumer and
 * the gateway app's types aren't importable across the app boundary. */

export interface ServiceHealth {
  service: string;
  ok: boolean;
  uptime?: number;
  error?: string;
}

export interface QueueDepth {
  name: string;
  messages: number;
  messagesReady: number;
  messagesUnacknowledged: number;
}

export type Section<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface DevStatusSnapshot {
  timestamp: string;
  services: ServiceHealth[];
  outbox: Section<{
    pending: number;
    quarantined: number;
    published: number;
    oldestPendingAt: string | null;
  }>;
  queues: Section<{ queues: QueueDepth[] }>;
}
