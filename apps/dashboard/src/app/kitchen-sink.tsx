import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Spinner,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components';
import type { BadgeStatus } from '../components';

const badgeStatuses: BadgeStatus[] = [
  'pending',
  'processing',
  'delivered',
  'failed',
  'neutral',
];

const sampleRows = [
  {
    id: 'c0ffee-01',
    service: 'content-service',
    status: 'delivered' as const,
    message: 'post created, outbox row written',
  },
  {
    id: 'c0ffee-02',
    service: 'ai-processing',
    status: 'processing' as const,
    message: 'calling Cloudflare Workers AI moderation endpoint',
  },
  {
    id: 'c0ffee-03',
    service: 'notification',
    status: 'failed' as const,
    message:
      'handler threw: socket registry lookup failed for user 42 — message routed to DLQ after 3 retries',
  },
];

/* Living style guide: every component in every state, on one page.
 * Review artifact for M1; also the first place a broken style shows up. */
export function KitchenSink() {
  const [isLoading, setIsLoading] = useState(false);

  const simulateLoading = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1500);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Kitchen sink</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every component, every state. If it looks wrong here, it's wrong
        everywhere.
      </p>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Buttons" description="Variants × sizes × states" />
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="sm" variant="secondary">
                Small secondary
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Disabled</Button>
              <Button isLoading={isLoading} onClick={simulateLoading}>
                {isLoading ? 'Saving…' : 'Click to load'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Badges" description="One per pipeline status" />
          <CardContent className="flex flex-wrap items-center gap-3">
            {badgeStatuses.map((status) => (
              <Badge key={status} status={status}>
                {status}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Form controls"
            description="Field wiring: hint, error, disabled"
            action={
              <Button size="sm" variant="secondary">
                Header action
              </Button>
            }
          />
          <CardContent className="space-y-4">
            <Field label="Post title" hint="Shown in the feed">
              <Input placeholder="My first post" />
            </Field>
            <Field label="Post body" error="Body is required">
              <Input />
            </Field>
            <Field label="Service">
              <Select defaultValue="content-service">
                <option value="api-gateway">api-gateway</option>
                <option value="content-service">content-service</option>
                <option value="ai-processing-service">
                  ai-processing-service
                </option>
              </Select>
            </Field>
            <Field label="Disabled input">
              <Input disabled value="read only" readOnly />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Loading" description="Spinner vs. skeleton" />
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Spinner size="sm" />
              <Spinner />
              <span className="text-sm text-muted-foreground">
                spinner: action in flight
              </span>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-4 w-32" />
              <p className="text-sm text-muted-foreground">
                skeleton: layout known, data pending
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Table" description="Statuses inside data rows" />
          <Table>
            <THead>
              <Tr>
                <Th>Correlation ID</Th>
                <Th>Service</Th>
                <Th>Status</Th>
                <Th>Message</Th>
              </Tr>
            </THead>
            <TBody>
              {sampleRows.map((row) => (
                <Tr key={row.id}>
                  <Td className="font-mono text-xs">{row.id}</Td>
                  <Td>{row.service}</Td>
                  <Td>
                    <Badge status={row.status}>{row.status}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{row.message}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Empty state" />
          <EmptyState
            title="No logs yet"
            description="Trigger a post through the pipeline to see logs appear here."
            action={<Button size="sm">Go to Trigger</Button>}
          />
        </Card>

        <Card>
          <CardHeader title="Error state" />
          <CardContent>
            <ErrorState
              detail="GET /dev/status → 502 Bad Gateway"
              onRetry={() => undefined}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
