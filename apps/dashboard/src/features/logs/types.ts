/* Mirrors api-gateway's LogEntry (dev-logs.service.ts). */
export interface LogEntry {
  id: string;
  ts: string;
  level: string;
  service: string;
  context: string;
  message: string;
}

export interface LogFilters {
  correlationId: string;
  service: string;
  level: string;
}

export const SERVICES = [
  'api-gateway',
  'content-service',
  'ai-processing-service',
  'analytics-service',
  'notification-service',
] as const;

export const LEVELS = [
  'log',
  'warn',
  'error',
  'fatal',
  'debug',
  'verbose',
] as const;

export function matchesFilters(entry: LogEntry, f: LogFilters): boolean {
  if (f.service && entry.service !== f.service) return false;
  if (f.level && entry.level !== f.level) return false;
  if (f.correlationId && !entry.message.includes(f.correlationId)) {
    return false;
  }
  return true;
}
