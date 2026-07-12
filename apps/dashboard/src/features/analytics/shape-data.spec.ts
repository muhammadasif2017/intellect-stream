import type { LogEntry } from '../logs/types';
import {
  categoryTotals,
  moderationTotals,
  stageLatencyAverages,
  verdictsByDay,
} from './shape-data';
import type { TrendRow } from './types';

const rows: TrendRow[] = [
  { date: '2026-07-11T00:00:00.000Z', category: 'none', verdict: 'approved', count: 8 },
  { date: '2026-07-11T00:00:00.000Z', category: 'S1', verdict: 'rejected', count: 2 },
  { date: '2026-07-12T00:00:00.000Z', category: 'none', verdict: 'approved', count: 5 },
  { date: '2026-07-12T00:00:00.000Z', category: 'S1', verdict: 'rejected', count: 1 },
  { date: '2026-07-12T00:00:00.000Z', category: 'S6', verdict: 'rejected', count: 3 },
];

describe('verdictsByDay', () => {
  it('aggregates counts per day, oldest first', () => {
    expect(verdictsByDay(rows)).toEqual([
      { date: '2026-07-11', approved: 8, rejected: 2, pending: 0 },
      { date: '2026-07-12', approved: 5, rejected: 4, pending: 0 },
    ]);
  });
});

describe('categoryTotals', () => {
  it('sums real categories descending and drops the "none" sentinel', () => {
    /* Tied counts keep first-seen order (stable sort). */
    expect(categoryTotals(rows)).toEqual([
      { category: 'S1', count: 3 },
      { category: 'S6', count: 3 },
    ]);
  });
});

describe('moderationTotals', () => {
  it('computes total and approval rate', () => {
    const { total, approvalRate } = moderationTotals(rows);
    expect(total).toBe(19);
    expect(approvalRate).toBeCloseTo(13 / 19);
  });

  it('has no rate with no data', () => {
    expect(moderationTotals([]).approvalRate).toBeUndefined();
  });
});

describe('stageLatencyAverages', () => {
  function entry(
    ts: string,
    service: string,
    context: string,
    correlationId: string,
  ): LogEntry {
    return {
      id: `${ts}-${service}`,
      ts,
      level: 'log',
      service,
      context,
      message: `stage marker correlationId=${correlationId}`,
    };
  }

  it('averages per-stage deltas across correlation groups', () => {
    const entries = [
      // chain A: gateway → content in 100ms
      entry('2026-07-12T10:00:00.000Z', 'api-gateway', 'PostsProxyService', 'a'),
      entry('2026-07-12T10:00:00.100Z', 'content-service', 'PostsService', 'a'),
      // chain B: gateway → content in 300ms
      entry('2026-07-12T11:00:00.000Z', 'api-gateway', 'PostsProxyService', 'b'),
      entry('2026-07-12T11:00:00.300Z', 'content-service', 'PostsService', 'b'),
    ];
    const { stages, chains } = stageLatencyAverages(entries);
    expect(chains).toBe(2);
    expect(stages).toEqual([
      { stage: 'Post created', avgMs: 200, samples: 2 },
    ]);
  });

  it('ignores entries without a correlationId marker', () => {
    const noise: LogEntry = {
      id: 'x',
      ts: '2026-07-12T10:00:00.000Z',
      level: 'log',
      service: 'api-gateway',
      context: 'Bootstrap',
      message: 'Application is running',
    };
    expect(stageLatencyAverages([noise]).chains).toBe(0);
  });
});
