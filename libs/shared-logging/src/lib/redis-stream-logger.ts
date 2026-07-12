import { ConsoleLogger } from '@nestjs/common';
import { createClient } from 'redis';

export const LOG_STREAM_KEY = 'logs:stream';
// Capped stream: ~10k entries is hours of dev-scale logs and a few MB of
// Redis — the sink can never grow unbounded. `~` lets Redis trim lazily.
const MAX_STREAM_LENGTH = 10_000;
// Entries logged before the connection resolves are held, not lost —
// bootstrap logs are exactly the ones you want when a service won't start.
const MAX_BUFFER = 100;

export interface LogStreamEntry {
  ts: string;
  level: string;
  service: string;
  context: string;
  message: string;
}

/* The subset of the redis client the sink touches — injectable for tests. */
export interface SinkClient {
  connect(): Promise<unknown>;
  xAdd(
    key: string,
    id: string,
    message: Record<string, string>,
    options?: unknown,
  ): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface RedisStreamLoggerOptions {
  json?: boolean;
  url?: string;
  client?: SinkClient;
}

/**
 * ConsoleLogger that additionally XADDs every entry to a capped Redis
 * Stream for the pipeline dashboard (SPEC: log sink decision, 2026-07-11).
 *
 * Everything about the sink is fire-and-forget: connection failures,
 * write failures, malformed entries — none of them may ever take down or
 * slow the service doing the logging. Worst case is silently missing
 * dashboard logs, and the console output (super) is always intact.
 */
export class RedisStreamLogger extends ConsoleLogger {
  private client: SinkClient | null = null;
  private ready = false;
  private disabled = false;
  private buffer: Record<string, string>[] = [];

  constructor(
    private readonly service: string,
    options: RedisStreamLoggerOptions = {},
  ) {
    super({ json: options.json ?? false });
    try {
      this.client =
        options.client ??
        (createClient({
          url: options.url ?? process.env['REDIS_URL'],
        }) as unknown as SinkClient);
      // Without a listener node-redis re-emits errors as uncaught.
      this.client.on?.('error', () => undefined);
      Promise.resolve(this.client.connect())
        .then(() => {
          this.ready = true;
          const pending = this.buffer;
          this.buffer = [];
          for (const entry of pending) this.write(entry);
        })
        .catch(() => {
          this.disabled = true;
          this.buffer = [];
        });
    } catch {
      this.disabled = true;
    }
  }

  override log(message: unknown, ...rest: unknown[]) {
    super.log(message, ...rest);
    this.sink('log', message, rest);
  }

  override error(message: unknown, ...rest: unknown[]) {
    super.error(message, ...rest);
    this.sink('error', message, rest);
  }

  override warn(message: unknown, ...rest: unknown[]) {
    super.warn(message, ...rest);
    this.sink('warn', message, rest);
  }

  override debug(message: unknown, ...rest: unknown[]) {
    super.debug(message, ...rest);
    this.sink('debug', message, rest);
  }

  override verbose(message: unknown, ...rest: unknown[]) {
    super.verbose(message, ...rest);
    this.sink('verbose', message, rest);
  }

  override fatal(message: unknown, ...rest: unknown[]) {
    super.fatal(message, ...rest);
    this.sink('fatal', message, rest);
  }

  private sink(level: string, message: unknown, rest: unknown[]) {
    if (this.disabled || !this.client) return;

    // Nest convention: a trailing string param is the log context.
    const last = rest[rest.length - 1];
    const context =
      typeof last === 'string' ? last : (this.options?.context ?? '');

    const entry: Record<string, string> = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      context,
      message: typeof message === 'string' ? message : safeStringify(message),
    };

    if (!this.ready) {
      if (this.buffer.length < MAX_BUFFER) this.buffer.push(entry);
      return;
    }
    this.write(entry);
  }

  private write(entry: Record<string, string>) {
    this.client
      ?.xAdd(LOG_STREAM_KEY, '*', entry, {
        TRIM: {
          strategy: 'MAXLEN',
          strategyModifier: '~',
          threshold: MAX_STREAM_LENGTH,
        },
      })
      .catch(() => undefined);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Bootstrap helper: one call per service main.ts. LOG_FORMAT=json keeps
 * ADR-0013 behavior; LOG_SINK=redis additionally streams to the dashboard.
 */
export function createServiceLogger(service: string): ConsoleLogger {
  const json = process.env['LOG_FORMAT'] === 'json';
  if (process.env['LOG_SINK'] === 'redis') {
    return new RedisStreamLogger(service, { json });
  }
  return new ConsoleLogger({ json });
}
