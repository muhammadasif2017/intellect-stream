import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalTokenService } from '../auth/internal-token.service';

const PROBE_TIMEOUT_MS = 2_000;

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

type Section<T> = ({ ok: true } & T) | { ok: false; error: string };

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

// One snapshot for the dashboard's Status page. Every probe is independently
// try/caught: a dead service is *data* ("content-service is down"), never a
// 500 on the snapshot itself.
@Injectable()
export class DevStatusService {
  private readonly logger = new Logger(DevStatusService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly internalToken: InternalTokenService,
  ) {}

  async snapshot(): Promise<DevStatusSnapshot> {
    const [services, outbox, queues] = await Promise.all([
      this.probeServices(),
      this.probeOutbox(),
      this.probeQueues(),
    ]);
    return { timestamp: new Date().toISOString(), services, outbox, queues };
  }

  private serviceTargets(): Array<{ service: string; baseUrl: string }> {
    return [
      {
        service: 'content-service',
        baseUrl: this.config.getOrThrow<string>('CONTENT_SERVICE_URL'),
      },
      {
        service: 'ai-processing-service',
        baseUrl: this.config.getOrThrow<string>('AI_SERVICE_URL'),
      },
      {
        service: 'analytics-service',
        baseUrl: this.config.getOrThrow<string>('ANALYTICS_SERVICE_URL'),
      },
      {
        service: 'notification-service',
        baseUrl: this.config.getOrThrow<string>('NOTIFICATION_SERVICE_URL'),
      },
    ];
  }

  private async probeServices(): Promise<ServiceHealth[]> {
    // The gateway is serving this very request — probing itself over HTTP
    // would only measure the loopback.
    const self: ServiceHealth = {
      service: 'api-gateway',
      ok: true,
      uptime: Math.round(process.uptime()),
    };

    const probes = this.serviceTargets().map(
      async ({ service, baseUrl }): Promise<ServiceHealth> => {
        try {
          const res = await fetch(`${baseUrl}/api/health`, {
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
          });
          if (!res.ok) {
            return { service, ok: false, error: `HTTP ${res.status}` };
          }
          const body = (await res.json()) as { uptime?: number };
          return { service, ok: true, uptime: body.uptime };
        } catch (err) {
          return { service, ok: false, error: (err as Error).message };
        }
      },
    );

    return [self, ...(await Promise.all(probes))];
  }

  private async probeOutbox(): Promise<DevStatusSnapshot['outbox']> {
    try {
      const baseUrl = this.config.getOrThrow<string>('CONTENT_SERVICE_URL');
      // Same trust path as every other internal call (ADR-0007) — the stats
      // endpoint verifies a gateway-minted token, not network position.
      const token = this.internalToken.mint('pipeline-dashboard');
      const res = await fetch(`${baseUrl}/api/dev/outbox-stats`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      return { ok: true, ...(await res.json()) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async probeQueues(): Promise<DevStatusSnapshot['queues']> {
    try {
      const baseUrl = this.config.getOrThrow<string>('RABBITMQ_MGMT_URL');
      const user = this.config.getOrThrow<string>('RABBITMQ_MGMT_USER');
      const pass = this.config.getOrThrow<string>('RABBITMQ_MGMT_PASS');
      const res = await fetch(`${baseUrl}/api/queues`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
        },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as Array<{
        name: string;
        messages?: number;
        messages_ready?: number;
        messages_unacknowledged?: number;
      }>;
      return {
        ok: true,
        queues: body.map((q) => ({
          name: q.name,
          messages: q.messages ?? 0,
          messagesReady: q.messages_ready ?? 0,
          messagesUnacknowledged: q.messages_unacknowledged ?? 0,
        })),
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
