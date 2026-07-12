import type { LogEntry } from '../logs/types';
import { deriveTrace, totalDurationMs } from '../trace/derive-trace';
import type { TrendRow } from './types';

export interface DayVerdicts {
  date: string; // YYYY-MM-DD
  approved: number;
  rejected: number;
  pending: number;
}

export function verdictsByDay(rows: TrendRow[]): DayVerdicts[] {
  const byDay = new Map<string, DayVerdicts>();
  for (const row of rows) {
    const date = row.date.slice(0, 10);
    const day =
      byDay.get(date) ?? { date, approved: 0, rejected: 0, pending: 0 };
    if (row.verdict === 'approved') day.approved += row.count;
    else if (row.verdict === 'rejected') day.rejected += row.count;
    else day.pending += row.count;
    byDay.set(date, day);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface CategoryTotal {
  category: string;
  count: number;
}

/* 'none' is the sentinel for clean approvals — real categories only,
 * this chart answers "what gets posts flagged". */
export function categoryTotals(rows: TrendRow[]): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.category === 'none') continue;
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function moderationTotals(rows: TrendRow[]) {
  let total = 0;
  let approved = 0;
  for (const row of rows) {
    total += row.count;
    if (row.verdict === 'approved') approved += row.count;
  }
  return {
    total,
    approvalRate: total > 0 ? approved / total : undefined,
  };
}

export interface StageLatency {
  stage: string;
  avgMs: number;
  samples: number;
}

const CORRELATION_RE = /correlationId=([\w-]+)/;

/* Latency analytics stay log-derived (spec: resolved decision 2): group a
 * recent log sample by correlationId, run each group through the same
 * deriveTrace the Trace page uses, average per-stage deltas. */
export function stageLatencyAverages(entries: LogEntry[]): {
  stages: StageLatency[];
  avgChainMs: number | undefined;
  chains: number;
} {
  const groups = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const id = CORRELATION_RE.exec(entry.message)?.[1];
    if (!id) continue;
    const group = groups.get(id) ?? [];
    group.push(entry);
    groups.set(id, group);
  }

  const sums = new Map<string, { total: number; samples: number }>();
  const chainDurations: number[] = [];

  for (const group of groups.values()) {
    const stages = deriveTrace(group);
    const duration = totalDurationMs(stages);
    if (duration !== undefined) chainDurations.push(duration);
    for (const stage of stages) {
      if (stage.latencyMs === undefined) continue;
      const sum = sums.get(stage.label) ?? { total: 0, samples: 0 };
      sum.total += stage.latencyMs;
      sum.samples += 1;
      sums.set(stage.label, sum);
    }
  }

  /* Output in pipeline order, not first-seen order — deriveTrace([]) is
   * the canonical stage list. */
  const orderedLabels = deriveTrace([]).map((s) => s.label);

  return {
    stages: orderedLabels
      .filter((label) => sums.has(label))
      .map((stage) => {
        const { total, samples } = sums.get(stage) as {
          total: number;
          samples: number;
        };
        return { stage, avgMs: Math.round(total / samples), samples };
      }),
    avgChainMs:
      chainDurations.length > 0
        ? Math.round(
            chainDurations.reduce((a, b) => a + b, 0) / chainDurations.length,
          )
        : undefined,
    chains: chainDurations.length,
  };
}
