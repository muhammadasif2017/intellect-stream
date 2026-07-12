import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components';
import { StatTile } from '../../components/stat-tile';
import { apiFetch } from '../../lib/api';
import type { LogEntry } from '../logs/types';
import {
  categoryTotals,
  moderationTotals,
  stageLatencyAverages,
  verdictsByDay,
} from './shape-data';
import type { TrendRow } from './types';

/* Chart hues = the token hex values (styles.css). Recharts writes SVG fill
 * attributes, so tokens are inlined here; status hues carry verdict
 * semantics (legend always present — never color alone), single accent hue
 * for magnitude-only bars. */
const HUES = {
  approved: '#10b981',
  rejected: '#ef4444',
  pending: '#f59e0b',
  accent: '#4f46e5',
  grid: '#e2e8f0',
  ink: '#64748b',
} as const;

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: HUES.ink, fontSize: 12 },
} as const;

const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: `1px solid ${HUES.grid}`,
    fontSize: 12,
  },
} as const;

export function AnalyticsPage() {
  const trends = useQuery({
    queryKey: ['trends'],
    queryFn: () => apiFetch<TrendRow[]>('/api/dev/trends?days=14'),
  });
  const logSample = useQuery({
    queryKey: ['latency-sample'],
    queryFn: () => apiFetch<LogEntry[]>('/api/dev/logs?limit=1000'),
  });

  if (trends.isPending) {
    return (
      <Shell>
        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </Shell>
    );
  }

  if (trends.isError) {
    return (
      <Shell>
        <div className="mt-8">
          <ErrorState
            title="Could not load analytics"
            detail={trends.error.message}
            onRetry={() => trends.refetch()}
          />
        </div>
      </Shell>
    );
  }

  const rows = trends.data;
  if (rows.length === 0) {
    return (
      <Shell>
        <div className="mt-8">
          <EmptyState
            title="No moderation data yet"
            description="Fire a few posts from the Trigger page — verdicts aggregate here per day."
          />
        </div>
      </Shell>
    );
  }

  const byDay = verdictsByDay(rows);
  const categories = categoryTotals(rows);
  const totals = moderationTotals(rows);
  const latency = logSample.data
    ? stageLatencyAverages(logSample.data)
    : undefined;

  return (
    <Shell>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Posts moderated" value={totals.total} hint="last 14 days" />
        <StatTile
          label="Approval rate"
          value={
            totals.approvalRate !== undefined
              ? `${Math.round(totals.approvalRate * 100)}%`
              : '—'
          }
        />
        <StatTile
          label="Avg chain duration"
          value={latency?.avgChainMs !== undefined ? formatMs(latency.avgChainMs) : '—'}
          hint={latency ? `${latency.chains} traced chains` : 'from log sample'}
        />
        <StatTile label="Flag categories" value={categories.length} />
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Verdicts per day"
            description="Stacked by moderation outcome"
          />
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byDay}>
                <CartesianGrid vertical={false} stroke={HUES.grid} />
                <XAxis
                  dataKey="date"
                  {...axisProps}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12 }}
                />
                {/* Stack order = severity bottom-up; 4px rounded top on the
                    last segment only (data-end), 2px gaps via stroke. */}
                <Bar dataKey="approved" stackId="v" fill={HUES.approved} barSize={20} stroke="#ffffff" strokeWidth={2} />
                <Bar dataKey="pending" stackId="v" fill={HUES.pending} barSize={20} stroke="#ffffff" strokeWidth={2} />
                <Bar dataKey="rejected" stackId="v" fill={HUES.rejected} barSize={20} stroke="#ffffff" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Flag categories"
            description="What gets posts flagged (clean approvals excluded)"
          />
          <CardContent>
            {categories.length === 0 ? (
              <EmptyState
                title="Nothing flagged yet"
                description="Categories appear when the AI rejects or flags content."
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(120, categories.length * 36)}
              >
                <BarChart data={categories} layout="vertical">
                  <XAxis type="number" {...axisProps} allowDecimals={false} hide />
                  <YAxis
                    type="category"
                    dataKey="category"
                    {...axisProps}
                    width={96}
                  />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                  <Bar
                    dataKey="count"
                    fill={HUES.accent}
                    barSize={16}
                    radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fill: HUES.ink, fontSize: 12 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Avg stage latency"
            description="Per pipeline hop, from traced log samples"
          />
          <CardContent>
            {!latency || latency.stages.length === 0 ? (
              <EmptyState
                title="No traced chains in the log sample"
                description="Run posts through the pipeline with LOG_SINK=redis on."
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(120, latency.stages.length * 36)}
              >
                <BarChart data={latency.stages} layout="vertical">
                  <XAxis type="number" {...axisProps} hide />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    {...axisProps}
                    width={120}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value) => [formatMs(Number(value)), 'avg']}
                  />
                  <Bar
                    dataKey="avgMs"
                    fill={HUES.accent}
                    barSize={16}
                    radius={[0, 4, 4, 0]}
                    label={{
                      position: 'right',
                      fill: HUES.ink,
                      fontSize: 12,
                      formatter: (value: number) => formatMs(value),
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Moderation outcomes and pipeline timing, last 14 days.
      </p>
      {children}
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
