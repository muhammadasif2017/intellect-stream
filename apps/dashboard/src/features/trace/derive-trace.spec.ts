import type { LogEntry } from '../logs/types';
import {
  deriveTrace,
  isTraceSettled,
  totalDurationMs,
} from './derive-trace';

let counter = 0;
function entry(
  ts: string,
  service: string,
  context: string,
  message: string,
  level = 'log',
): LogEntry {
  return {
    id: `${++counter}-0`,
    ts,
    level,
    service,
    context,
    message,
  };
}

const fullChain: LogEntry[] = [
  entry(
    '2026-07-12T10:00:00.000Z',
    'api-gateway',
    'PostsProxyService',
    'POST /posts forwarded, upstream 201 correlationId=c1',
  ),
  entry(
    '2026-07-12T10:00:00.050Z',
    'content-service',
    'PostsService',
    'Post p1 created, outbox row written correlationId=c1',
  ),
  entry(
    '2026-07-12T10:00:02.000Z',
    'content-service',
    'OutboxRelayService',
    'Published moderation.job to rabbitmq correlationId=c1',
  ),
  entry(
    '2026-07-12T10:00:03.000Z',
    'ai-processing-service',
    'ModerationConsumerService',
    "Moderation verdict 'approved' for post p1 published correlationId=c1",
  ),
  entry(
    '2026-07-12T10:00:03.500Z',
    'content-service',
    'ModerationCompletedConsumerService',
    "Post p1 status set to 'approved' correlationId=c1",
  ),
  entry(
    '2026-07-12T10:00:05.000Z',
    'content-service',
    'OutboxRelayService',
    'Published moderation.completed to kafka correlationId=c1',
  ),
  entry(
    '2026-07-12T10:00:05.400Z',
    'analytics-service',
    'TrendsService',
    'Trend aggregated for post p1 (approved) correlationId=c1',
  ),
  entry(
    '2026-07-12T10:00:05.600Z',
    'notification-service',
    'ModerationPushService',
    'Pushed verdict for post p1 to 1 socket(s) correlationId=c1',
  ),
];

describe('deriveTrace', () => {
  it('marks every stage done for a full chain, in pipeline order', () => {
    const stages = deriveTrace(fullChain);
    expect(stages.map((s) => s.key)).toEqual([
      'gateway',
      'post-created',
      'job-published',
      'ai-verdict',
      'verdict-applied',
      'result-published',
      'analytics',
      'notification',
    ]);
    expect(stages.every((s) => s.status === 'done')).toBe(true);
  });

  it('separates the relay stages by broker', () => {
    const stages = deriveTrace(fullChain);
    const job = stages.find((s) => s.key === 'job-published');
    const result = stages.find((s) => s.key === 'result-published');
    expect(job?.entries[0].message).toContain('rabbitmq');
    expect(result?.entries[0].message).toContain('kafka');
  });

  it('computes latency as the delta from the previous reached stage', () => {
    const stages = deriveTrace(fullChain);
    expect(stages[0].latencyMs).toBeUndefined();
    expect(stages[1].latencyMs).toBe(50);
    expect(stages[2].latencyMs).toBe(1950);
  });

  it('marks unreached stages pending and later stages still compute', () => {
    const partial = fullChain.slice(0, 3);
    const stages = deriveTrace(partial);
    expect(stages[2].status).toBe('done');
    expect(stages[3].status).toBe('pending');
    expect(isTraceSettled(stages)).toBe(false);
  });

  it('marks a stage with error-level entries as error and settles the trace', () => {
    const withError = [
      ...fullChain.slice(0, 3),
      entry(
        '2026-07-12T10:00:04.000Z',
        'ai-processing-service',
        'ModerationConsumerService',
        'handler failed messageId=m1 correlationId=c1',
        'error',
      ),
    ];
    const stages = deriveTrace(withError);
    expect(stages[3].status).toBe('error');
    expect(isTraceSettled(stages)).toBe(true);
  });

  it('settles only when all stages are done', () => {
    expect(isTraceSettled(deriveTrace(fullChain))).toBe(true);
  });

  it('computes total duration across reached stages', () => {
    expect(totalDurationMs(deriveTrace(fullChain))).toBe(5600);
  });
});
