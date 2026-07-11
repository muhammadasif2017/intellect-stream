# Plan: Pipeline Dashboard

Spec: [docs/spec/pipeline-dashboard.md](../spec/pipeline-dashboard.md)
Status: APPROVED 2026-07-11

## Verified facts (2026-07-11)

- No `/health` endpoints exist in any service.
- analytics-service has no read API (boilerplate controller only).
- Logging = Nest built-in `ConsoleLogger`, JSON via `LOG_FORMAT=json` (ADR-0013), stdout only. No shared logging lib.
- Database-per-service boundary means api-gateway cannot query content-service's outbox table — outbox stats must come from a content-service endpoint.

## Components

### A. Backend enablement (thin, approved tier)

1. **`libs/shared-logging`** — `RedisStreamLogger extends ConsoleLogger`: on top of console output, `XADD` each entry to capped Redis Stream `logs:stream` (`MAXLEN ~ 10000`), fire-and-forget (log sink failure must never break a service). Enabled by env flag (`LOG_SINK=redis`), off by default. Wired into all 5 services' bootstrap.
2. **`/health` per service** — trivial controller returning `{ status, service, uptime }`. Small shared helper or copy-paste; no terminus dependency needed at this scale.
3. **content-service `GET /dev/outbox-stats`** — pending/quarantined counts (internal-token guarded, dev-only flag).
4. **analytics-service read API** — `GET /trends` (aggregates it already persists).
5. **api-gateway dev module** (all dev-flag guarded, session-authed):
   - `GET /dev/logs?correlationId&service&level&limit` — `XRANGE` + filter
   - `GET /dev/logs/stream` — SSE bridging `XREAD BLOCK`
   - `GET /dev/status` — fan-out: 5× `/health`, content `/dev/outbox-stats`, RabbitMQ management API (`:15672/api/queues`) for queue/DLQ depths

### B. Frontend foundation

6. **Scaffold** — add `@nx/react`, generate `apps/dashboard` (Vite + Vitest), Tailwind v4, design tokens (spacing/type/color scale), app shell with navigation. Every token choice annotated.
7. **Design system core** — Button, Card, Badge, Input, Select, Table, Spinner/Skeleton, EmptyState, ErrorState. Hand-built, annotated.
8. **Data layer** — typed API client, TanStack Query setup, SSE hook, socket.io client for notification-service.

### C. Surfaces (one slice each, ship order)

9. **Status** — first surface: simplest data shape, exercises loading/empty/error patterns that all later surfaces reuse.
10. **Trigger** — login + create-post form; shows returned `x-correlation-id` and links to trace.
11. **Logs** — filterable table + live stream mode (SSE).
12. **Trace** — pipeline visualization per correlationId, derived by grouping/ordering log entries by service + timestamp; stage latency from timestamp deltas.
13. **Analytics** — Recharts: throughput, verdict counts, stage-latency distribution.

## Order & dependencies

```
6 → 7 → 8 → [2,5-status part] → 9 → 10
1 → 5-logs part → 11 → 12
4 → 13          3 → (into 5-status)
```

Concretely, milestone sequence — each ends with a working, reviewable state:

- **M1 Foundation:** tasks 6, 7, 8 (dashboard runs, design system visible in a scratch page)
- **M2 Status:** tasks 2, 3, 5(status), 9
- **M3 Trigger:** task 10 (uses existing gateway endpoints only)
- **M4 Logs:** tasks 1, 5(logs), 11
- **M5 Trace:** task 12
- **M6 Analytics:** tasks 4, 13

## Risks

- **Tailwind v4 + Nx 23 wiring** — v4 is CSS-first (no tailwind.config.js); verify Vite plugin path early in M1.
- **SSE through gateway** — session middleware + long-lived response; verify one hello-world SSE endpoint before building on it.
- **Redis Stream growth** — MAXLEN cap + off-by-default flag contains it.
- **Trace correctness** — depends on services actually logging publish/consume per correlationId; M5 may need a few log-line additions in services (still thin tier).

## M1 Tasks (approved for implementation)

- [x] **T1: Scaffold dashboard app** (done 2026-07-11)
  - Acceptance: `apps/dashboard` exists (React + Vite + Vitest via `@nx/react`), default page renders, lint/test targets green
  - Verify: `pnpm nx serve dashboard`, `pnpm nx test dashboard`, `pnpm nx lint dashboard`
  - Files: generator output + `package.json`/`nx.json` (plugin add)

- [ ] **T2: Tailwind v4 + design tokens**
  - Acceptance: Tailwind v4 wired (CSS-first `@theme`); tokens defined for color palette, spacing scale, type scale, radii; each token choice annotated in `apps/dashboard/DECISIONS.md`
  - Verify: token classes render on the default page; serve + build green
  - Files: `apps/dashboard/src/styles/*`, `vite.config.ts`, `DECISIONS.md`

- [ ] **T3: App shell + routing**
  - Acceptance: React Router with layout shell (sidebar nav), 5 stub routes (status/trigger/logs/trace/analytics), active-state nav; responsive at 1440/768; annotated
  - Verify: navigate all routes in browser at both widths
  - Files: `apps/dashboard/src/app/*` (~4 files), `DECISIONS.md`

- [ ] **T4: Core components — feedback set**
  - Acceptance: Button, Badge, Card, Spinner + Skeleton; typed variant props; annotated
  - Verify: `pnpm nx test dashboard` (behavioral tests for variants), render on scratch page
  - Files: `apps/dashboard/src/components/*` (~5 files)

- [ ] **T5: Core components — data set**
  - Acceptance: Input, Select (Radix), Table, EmptyState, ErrorState; annotated
  - Verify: tests + scratch page render
  - Files: `apps/dashboard/src/components/*` (~5 files)

- [ ] **T6: Kitchen-sink page**
  - Acceptance: `/kitchen-sink` route renders every component in every state (incl. loading/empty/error) — living style guide and review artifact
  - Verify: visual pass in browser; this page is the M1 review gate
  - Files: `apps/dashboard/src/app/kitchen-sink.tsx` + route entry

- [ ] **T7: Data layer**
  - Acceptance: typed fetch wrapper (credentials included, error normalization), TanStack Query provider wired, `useSse` hook (EventSource lifecycle), socket.io client factory; unit tests for wrapper + hook
  - Verify: `pnpm nx test dashboard`
  - Files: `apps/dashboard/src/lib/*` (~5 files)

Deferred within M1: dark mode (tokens built theme-ready; toggle lands as separate task later).

## Verification checkpoints

- After M1: `pnpm nx serve dashboard` renders shell + components; lint/test green.
- After each M2–M6: corresponding spec success criterion demonstrably works against live docker-compose stack.
