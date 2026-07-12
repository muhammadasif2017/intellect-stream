import { Inject, Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '@intellect-stream/shared-redis';
import { LOG_STREAM_KEY } from '@intellect-stream/shared-logging';

export interface LogEntry {
  id: string;
  ts: string;
  level: string;
  service: string;
  context: string;
  message: string;
}

export interface LogFilters {
  correlationId?: string;
  service?: string;
  level?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 200;
// How deep a filtered query digs into the stream before giving up — keeps
// a narrow filter over a busy stream from scanning all 10k entries.
const SCAN_DEPTH = 2_000;
const STREAM_BLOCK_MS = 5_000;

@Injectable()
export class DevLogsService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
  ) {}

  async query(filters: LogFilters): Promise<LogEntry[]> {
    const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, 1_000);
    // Newest-first read; filtering happens here, not in Redis — stream
    // entries aren't indexed by field, and dev-scale volumes make a
    // bounded scan cheaper than maintaining secondary structures.
    const raw = await this.redis.xRevRange(LOG_STREAM_KEY, '+', '-', {
      COUNT: SCAN_DEPTH,
    });
    const entries: LogEntry[] = [];
    for (const item of raw) {
      const entry = toEntry(item.id, item.message);
      if (!matches(entry, filters)) continue;
      entries.push(entry);
      if (entries.length >= limit) break;
    }
    return entries;
  }

  /* One dedicated blocking connection per SSE subscriber: XREAD BLOCK
   * parks the whole connection, so the shared client (sessions, rate
   * limit) must never be used for it. Torn down with the subscription. */
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let stopped = false;
      let blockingClient: RedisClientType | undefined;

      (async () => {
        blockingClient = this.redis.duplicate();
        await blockingClient.connect();
        let lastId = '$'; // only entries logged after subscribing
        while (!stopped) {
          const result = await blockingClient.xRead(
            { key: LOG_STREAM_KEY, id: lastId },
            { BLOCK: STREAM_BLOCK_MS, COUNT: 100 },
          );
          if (!result) continue; // block window elapsed, re-arm
          for (const stream of result) {
            for (const item of stream.messages) {
              lastId = item.id;
              subscriber.next({ data: toEntry(item.id, item.message) });
            }
          }
        }
      })().catch((err) => {
        if (!stopped) subscriber.error(err);
      });

      return () => {
        stopped = true;
        // disconnect (not quit) breaks out of an in-flight XREAD BLOCK.
        blockingClient?.disconnect().catch(() => undefined);
      };
    });
  }
}

function toEntry(id: string, fields: Record<string, string>): LogEntry {
  return {
    id,
    ts: fields['ts'] ?? '',
    level: fields['level'] ?? 'log',
    service: fields['service'] ?? '',
    context: fields['context'] ?? '',
    message: fields['message'] ?? '',
  };
}

function matches(entry: LogEntry, filters: LogFilters): boolean {
  if (filters.service && entry.service !== filters.service) return false;
  if (filters.level && entry.level !== filters.level) return false;
  if (
    filters.correlationId &&
    !entry.message.includes(filters.correlationId)
  ) {
    return false;
  }
  return true;
}
