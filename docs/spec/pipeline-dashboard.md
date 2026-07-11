# Spec: Pipeline Dashboard

Intent: [docs/intent/pipeline-dashboard.md](../intent/pipeline-dashboard.md)
Status: APPROVED 2026-07-11 (log sink: Redis Stream + gateway SSE; latency: log-derived)

## Objective

A polished, single-user dev dashboard (`apps/dashboard`) that exercises the whole IntellectStream pipeline end to end from one screen:

1. **Trigger** — log in and create a test post through api-gateway (the real entry path, no shortcuts).
2. **Trace** — follow that post's `correlationId` as it travels content-service → outbox → RabbitMQ → ai-processing → Kafka → analytics/notification, rendered as a live pipeline view.
3. **Logs** — browse/stream structured JSON logs, filterable by `correlationId`, service, and level.
4. **Status** — service health, outbox backlog, RabbitMQ queue/DLQ depth at a glance.
5. **Analytics** — throughput, moderation verdict counts, latency per stage from analytics-service data.

Secondary (equal-priority) objective: the build is a frontend-craft course. Every UI decision (spacing, type, color, states, layout) is annotated with its reasoning as it's written.

## Tech Stack

| Concern | Choice | Why |
|---|---|---|
| App | React 19 + Vite via `@nx/react` (plugin must be added) | Mainstream, fast dev loop, fits Nx 23 |
| Language | TypeScript (strict) | Matches workspace |
| Styling | Tailwind CSS v4, no component library | Learning goal — hand-built components teach spacing/color/hierarchy; a library would hide the craft |
| Accessible primitives | Radix UI (dialog, dropdown, tabs only) | A11y correctness without stealing styling decisions |
| Data fetching | TanStack Query | Cache/retry/loading states as first-class concepts |
| Real-time | socket.io-client (notification-service WS) + SSE for log stream | socket.io already in stack |
| Charts | Recharts | Small API surface, styleable |
| Routing | React Router | Standard |
| Tests | Vitest + Testing Library | Vite-native |

## Backend touchpoints (thin additions — "Ask first" tier)

Dashboard is read-mostly over existing surfaces, but three thin additions are needed:

1. **Log sink**: shared logger dual-writes JSON logs to a capped Redis Stream (Redis already in stack). Dev-only, size-capped.
2. **Log/status read API**: dev-guarded endpoints on api-gateway — `GET /dev/logs?correlationId=…`, SSE `GET /dev/logs/stream`, `GET /dev/status` (aggregates service `/health`, outbox pending count, RabbitMQ queue depths via management API).
3. **Analytics read endpoint** on analytics-service if none exists yet.

No changes to domain logic, contracts, or broker topology.

## Commands

```
pnpm nx serve dashboard          # dev server
pnpm nx build dashboard
pnpm nx test dashboard
pnpm nx lint dashboard
```

(Exact targets confirmed after `@nx/react` generator runs.)

## Project Structure

```
apps/dashboard/src/
  app/            → routes/pages (trigger, trace, logs, status, analytics)
  components/     → hand-built design-system components (Button, Card, Badge, …)
  features/       → per-surface logic (trace/, logs/, status/, analytics/, trigger/)
  lib/            → api client, ws client, query hooks, formatting utils
  styles/         → tokens (spacing/color/type scale), Tailwind config
```

## Code Style

Follows workspace ESLint/Prettier. Components: function components, props typed explicitly, variants via discriminated props not boolean soup:

```tsx
type BadgeProps = {
  status: 'pending' | 'processing' | 'delivered' | 'failed';
  children: React.ReactNode;
};

export function Badge({ status, children }: BadgeProps) {
  return <span className={cn(badgeBase, badgeByStatus[status])}>{children}</span>;
}
```

Every component lands with a decision note (in PR/commit description or `DECISIONS.md`) explaining the styling reasoning.

## Testing Strategy

- Vitest + Testing Library for components with logic (states, formatting, hooks). No snapshot-only tests.
- Existing `apps/e2e-tests` untouched; dashboard e2e out of scope for v1.
- Manual verification against live stack is the primary loop (it's a dev tool for exactly that).

## Boundaries

- **Always:** annotate UI decisions; handle loading/empty/error states for every data surface; run `pnpm nx lint dashboard && pnpm nx test dashboard` before commits; build incrementally (small reviewable slices).
- **Ask first:** any backend endpoint addition (list above), new dependencies beyond Tech Stack table, changes to shared libs.
- **Never:** touch domain logic/contracts/broker topology; add auth complexity (uses existing session login); expose `/dev/*` endpoints outside dev environment; commit secrets.

## Success Criteria

- [ ] From dashboard alone: log in → create post → watch it reach every stage → read its logs → see analytics update. No Postman, no terminal log-grepping.
- [ ] Trace view shows per-stage status for a given correlationId within ~2s of each stage completing.
- [ ] Logs view filters by correlationId/service/level; live stream mode works.
- [ ] Status view shows all 5 services' health + outbox backlog + queue/DLQ depth.
- [ ] Every data surface has designed loading, empty, and error states.
- [ ] Responsive: usable at 1440px and 768px widths.
- [ ] Decision annotations exist for every component/screen shipped.

## Resolved Decisions

1. Log sink: Redis Stream + dev-only gateway SSE/query endpoints (approved 2026-07-11).
2. Latency-per-stage: derived from correlated log timestamps, no analytics-service changes (approved 2026-07-11).

## Open Questions

1. Do services already expose `/health`? Does analytics-service have any REST read endpoint? (Verify at plan phase; determines size of backend touchpoints.)
