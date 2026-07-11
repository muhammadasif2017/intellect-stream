import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../components';
import { StatTile } from '../../components/stat-tile';
import { useDevStatus } from './use-dev-status';

function formatUptime(seconds?: number): string {
  if (seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatAge(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return `oldest waiting ${formatUptime(seconds)}`;
}

function PageHeader() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Service health, outbox backlog, queue and DLQ depths. Refreshes every
        5s.
      </p>
    </>
  );
}

/* Skeletons mirror the loaded layout 1:1 — no reflow when data lands. */
function StatusSkeleton() {
  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardHeader title="Services" />
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Outbox" />
        <CardContent className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function StatusPage() {
  const { data, isPending, isError, error, refetch } = useDevStatus();

  if (isPending) {
    return (
      <div>
        <PageHeader />
        <StatusSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader />
        <div className="mt-8">
          <ErrorState
            title="Could not reach the gateway"
            detail={error.message}
            onRetry={() => refetch()}
          />
        </div>
      </div>
    );
  }

  const { services, outbox, queues } = data;

  return (
    <div>
      <PageHeader />
      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader
            title="Services"
            description="Probed by the gateway, 2s timeout each"
          />
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-5">
            {services.map((svc) => (
              <div key={svc.service}>
                <p
                  className="truncate font-mono text-xs text-muted-foreground"
                  title={svc.service}
                >
                  {svc.service}
                </p>
                <div className="mt-1.5">
                  <Badge status={svc.ok ? 'delivered' : 'failed'}>
                    {svc.ok ? 'up' : 'down'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {svc.ok ? `up ${formatUptime(svc.uptime)}` : svc.error}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Outbox"
            description="content-service transactional outbox"
          />
          <CardContent>
            {outbox.ok ? (
              <div className="grid grid-cols-3 gap-4">
                <StatTile
                  label="Pending"
                  value={outbox.pending}
                  hint={formatAge(outbox.oldestPendingAt)}
                />
                <StatTile
                  label="Quarantined"
                  value={outbox.quarantined}
                  tone={outbox.quarantined > 0 ? 'danger' : 'default'}
                  hint={
                    outbox.quarantined > 0 ? 'needs manual replay' : undefined
                  }
                />
                <StatTile label="Published" value={outbox.published} />
              </div>
            ) : (
              <ErrorState title="Outbox stats unavailable" detail={outbox.error} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Queues"
            description="RabbitMQ depths — .dlq rows are dead letters"
          />
          {queues.ok ? (
            queues.queues.length === 0 ? (
              <EmptyState
                title="No queues declared yet"
                description="Queues appear after the first service touches RabbitMQ."
              />
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Queue</Th>
                    <Th className="text-right">Ready</Th>
                    <Th className="text-right">Unacked</Th>
                    <Th className="text-right">Total</Th>
                  </Tr>
                </THead>
                <TBody>
                  {queues.queues.map((q) => (
                    <Tr key={q.name}>
                      <Td className="font-mono text-xs">{q.name}</Td>
                      <Td className="text-right tabular-nums">
                        {q.messagesReady}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {q.messagesUnacknowledged}
                      </Td>
                      <Td
                        className={
                          q.name.endsWith('.dlq') && q.messages > 0
                            ? 'text-right font-medium tabular-nums text-status-failed'
                            : 'text-right tabular-nums'
                        }
                      >
                        {q.messages}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )
          ) : (
            <CardContent>
              <ErrorState title="Queue depths unavailable" detail={queues.error} />
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
