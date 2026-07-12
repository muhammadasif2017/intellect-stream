# Dashboard UI Decisions

Every styling/design decision, with the reasoning. Newest at the bottom.
This file is the "why" companion to the code — read it alongside the diff.

---

## T2 — Tailwind v4 + design tokens (2026-07-11)

### Why Tailwind v4 (CSS-first) at all

- Utilities keep every spacing/color decision **visible at the point of use**
  — you read `p-6 gap-2 text-sm` and see the design, instead of chasing a
  class name into a stylesheet. For learning craft, that visibility is the
  point.
- v4 configures the theme in CSS (`@theme` block) rather than
  `tailwind.config.js`. Tokens live next to the styles they feed, and each
  `--color-*` / `--font-*` variable automatically becomes a utility class
  (`--color-surface` → `bg-surface`, `text-surface`, `border-surface` …).

### Semantic tokens over raw palette

Components say `bg-surface` / `text-muted-foreground`, never `bg-white` /
`text-slate-500`.

- **Why:** a semantic name records the *role* ("this is a card surface"),
  not the current answer ("white"). When dark mode lands, we change ~10
  token values in one file; zero components change. Raw palette classes
  would mean editing every component.
- **Convention:** semantic tokens for anything that must flip with a theme
  (surfaces, text, borders, brand). Raw palette utilities (e.g. `bg-red-50`
  for a failed-badge tint) stay allowed *inside* components — those get
  handled when the component itself learns about themes.
- Names follow the shadcn/ui convention (`background`, `foreground`,
  `muted-foreground`, `primary`) because it's the vocabulary most of the
  React ecosystem shares — transferable knowledge, no invented dialect.

### Color: slate, not gray — and only one accent

- Neutral scale is **slate** (blue-tinted gray) rather than pure `gray`.
  Pure gray next to colored elements reads slightly dirty/yellowish
  (simultaneous-contrast effect); a cool-tinted neutral sits cleaner behind
  the blues/indigos a data dashboard is full of.
- **One accent** (indigo) for everything interactive: buttons, links, focus
  rings, active nav. Restraint is the entire trick to "designed-looking" UIs
  — when only interactive things carry the accent, color *means* something.
  Indigo specifically: far enough from the four status hues (amber, blue,
  emerald, red) that "interactive" never collides with "state". Plain blue
  would fight the `processing` status hue.
- **Status hues are the loud exception.** A pipeline dashboard's core read
  is "what state is this message in" — those four colors do semantic work,
  so everything else stays quiet to give them contrast.
- Two-step interaction shade (`primary` → `primary-strong` on hover):
  darkening on hover reads as "pressed toward you"; lightening reads as
  disabled. 600→700 is one palette step — perceptible, not jarring.

### Light theme first, dark-ready

Tokens carry light values today. Because components only reference semantic
names, dark mode later = override the variables under a `.dark` scope. We
deliberately did *not* build the toggle now (M1 scope control) — but every
decision above was made so it won't require rework.

### Typography: system stacks, no webfont

- `--font-sans` = system UI stack. Zero download, zero flash-of-unstyled-
  text, and OS-native rendering. Webfonts earn their cost on marketing
  pages; a dev tool wants instant text. (Also: strict CSP later is easier
  with no font origin.)
- `--font-mono` = system mono stack, used for **data**: correlation IDs,
  log lines, timestamps. Mono digits align vertically in tables and make
  IDs scannable — this sans/mono split ("prose vs. data") is the main
  typographic device of the whole dashboard.

### Scales we did NOT touch (also a decision)

- **Spacing** stays Tailwind's default 4px base scale. A 4px grid is the
  de-facto standard (fits 8pt grids, icon sizes, line heights). Inventing a
  custom scale is where "designed by a backend dev" usually starts.
- **Type scale & radii** stay default for the same reason: the defaults are
  a professionally tuned modular scale; craft here is *choosing from* the
  scale consistently (e.g. body `text-sm`, section labels `text-sm
  font-medium text-muted-foreground`, page titles `text-2xl font-semibold
  tracking-tight`), not redefining it.
- Hex values (not v4's oklch) for now: legible to a human diff-reader, and
  the palette anchors are documented per-token. Migrating to oklch is a
  find-replace when we care about wide-gamut screens.

### Micro-decisions on the token-proof page (temporary, dies in T3)

- Page title `text-2xl font-semibold tracking-tight`: semibold, not bold —
  large text gains apparent weight, so bold at 24px looks shouty. Slight
  negative tracking because large text naturally sits too loose.
- Section label pattern `text-sm font-medium text-muted-foreground`: labels
  whisper, content speaks — hierarchy via color + weight, not size jumps.
- Card = `bg-surface` + `border-border` + `rounded-lg` + `p-6`: on a
  slate-50 canvas, a white card needs only a hairline border — no shadow.
  Shadows are for things that float (menus, dialogs).
- Status dots are `size-3 rounded-full` next to mono labels: color plus
  text, never color alone (colorblind users; also greyscale printouts).

---

## T3 — App shell + routing (2026-07-11)

### Sidebar, not top nav (on desktop)

Dev/ops tools near-universally use a left sidebar (Grafana, Datadog, RabbitMQ
mgmt): vertical lists scan faster than horizontal ones, grow without
reflowing the page, and leave the full viewport width for data — which a
logs/trace view will need. Width `w-56` (224px): fits the longest label plus
active-state padding with room to spare, small enough not to steal space
from tables. Fixed width (not `max-content`) so the content area doesn't
shift when labels change.

### Active nav state: tint + color, not borders or inversion

Active item = `bg-primary/10 text-primary font-medium`. A 10% tint of the
accent is the quietest treatment that still reads instantly ("lit up"), and
it reuses the accent's meaning: *interactive/current*. Rejected: left-border
markers (fight the rounded shape), full-primary background (turns nav into
five shouting buttons — the strongest treatment must be reserved for real
actions). Inactive items are `text-muted-foreground` so the current page is
also findable by being the only *dark* label.

### Responsive: horizontal rail on mobile, no hamburger

Below `md` the same nav renders as a horizontal, scrollable strip under the
brand (`flex` → `md:flex-col`, `overflow-x-auto`). A hamburger menu would
hide five links behind a tap to save space we don't need — hamburgers are
for when nav *can't* fit, not a default. One markup tree, classes flip the
axis: no duplicated nav to keep in sync.

### Layout mechanics worth knowing

- `md:sticky md:top-0 md:h-screen` on the sidebar: sidebar stays put while
  content scrolls — persistent orientation, standard tool behavior.
- `min-w-0` on `<main>`: flex children default to `min-width: auto`, which
  lets wide content (tables, log lines) blow the layout open instead of
  scrolling internally. This one class is the classic fix; forget it and
  the first wide `<pre>` breaks the page.
- No `max-width` on content: dashboards are data-dense; prose sites cap
  line length for readability, tools give data the room. Padding steps
  `p-4 → md:p-8` so small screens don't waste edge space.
- Root redirect `/` → `/status`: a tool should open on "is everything OK?",
  not a welcome page. `replace` keeps Back-button history clean.
- Focus: `focus-visible:outline-primary` (not `focus:`) — visible ring for
  keyboard users, none on mouse click. Accent-colored ring keeps "interactive"
  consistent.

---

## T4 — Feedback components: Button, Badge, Card, Spinner, Skeleton (2026-07-11)

### Button: four variants = a strength hierarchy, not four styles

`primary` (solid accent) / `secondary` (bordered surface) / `ghost` (bare) /
`danger` (solid red). The discipline they encode: **one primary per view** —
it marks *the* action; everything else steps down. Danger is solid red and
visually equal in weight to primary because destructive actions must never
look incidental. Variants are a union prop, not booleans (`variant="ghost"`,
never `ghost primary` contradictions — invalid states unrepresentable).

- Fixed heights (`h-8`/`h-9`) instead of vertical padding: buttons, inputs,
  and selects must share row height or every toolbar looks crooked. Height
  is the contract; padding only shapes the horizontal.
- `type="button"` as the default: HTML's default is `submit`, which makes
  any button inside a form submit it — a classic bug. Tested, because it's
  behavior, not looks.
- Loading = spinner **plus** disabled, spinner inherits `currentColor`
  (white on primary, dark on secondary — free theming via inheritance).
- Disabled = `opacity-50` on the *whole* button: keeps the variant
  recognizable ("the primary action exists, just unavailable") instead of
  swapping to a gray that hides what it was.

### Badge: tinted chip + dark text + dot

Solid-color badges (white on amber) fail contrast and make a table of
statuses look like a fruit machine. The quiet pattern: 50-shade tinted
background with a 700-shade text of the same hue — AA contrast, low noise —
plus a small solid dot in the raw status hue so the color anchor stays
strong at a glance. Text label always present (never color alone —
colorblindness, greyscale). `rounded-full` + `text-xs`: chips read as
metadata, not buttons; the pill shape distinguishes "state" from anything
clickable (which is `rounded-md` here).

### Card: compound slots, not a prop bag

`Card` + `CardHeader` + `CardContent` compose, rather than one `<Card
title description footer …>` prop-bag. Slots keep layout ownership in the
component (consistent padding/border everywhere) while content stays free.
Header bottom border separates chrome from content; `px-5 py-4` asymmetry
because horizontal space needs more breathing room than vertical at these
sizes.

### Spinner & Skeleton: two different "loading" jobs

- **Spinner** = "an action is in flight" (button press, refetch). Quarter-
  arc over a faint full-circle track: the track shows the path, the arc
  shows motion — a bare arc looks broken at small sizes. `role="status"` +
  label for screen readers; the SVG itself `aria-hidden`.
- **Skeleton** = "this region's shape is known, data isn't" (first load of
  a card/table). Caller passes the shape (`h-4 w-32`) so the skeleton
  mirrors the final layout — no reflow jump when data lands. `animate-pulse`
  not shimmer: pulse is CSS-only and calm; shimmer is marketing-page
  energy. `aria-hidden` — the *container* announces loading, not ten gray
  boxes.
- Rule of thumb encoded: skeleton for first paint, spinner for actions.

---

## T5 — Data components: Input, Field, Select, Table, Empty/Error states (2026-07-11)

### Native `<select>`, not Radix (deviation from the task text, deliberate)

The spec approved Radix for dialog/dropdown/tabs — pieces the platform has
no good primitive for. A filter dropdown isn't that: native `<select>` gives
keyboard support, screen-reader behavior, and the OS picker on mobile for
free. The skin trick: `appearance-none` removes platform chrome, an inline
SVG chevron (absolutely positioned, `pointer-events-none` so clicks fall
through) replaces it. The *closed* control looks custom; the *open* list
stays native. Reach for Radix Select only when options need custom rendering
(colors, icons) — ours are service names and log levels.

### Field: accessibility as a component, not a checklist

Label↔control wiring (`htmlFor`/`id`), error text linked via
`aria-describedby`, `aria-invalid` on failure — every form gets this wrong
somewhere when it's left to discipline. `Field` owns it structurally:
`useId()` generates the pairing, `cloneElement` pushes `id`/`invalid`/
`aria-describedby` into whatever single control it wraps. Callers *can't*
forget. Error replaces hint (never both — competing small texts under a
field read as clutter); error text in `status-failed` red + control border
flips red, so the eye finds the broken field from anywhere on the page.

### Input/Select share the Button contract

Same `h-9`, same radius, same focus ring, same disabled treatment — a form
row of [Input][Select][Button] sits on one line like one instrument. This is
why T4 fixed control height instead of using padding.

### Table: quiet grid, loud data

- Wrapper div owns `overflow-x-auto`: wide log lines scroll inside the
  card (completing the T3 `min-w-0` story).
- Only *horizontal* rules (`divide-y`), no vertical lines, no zebra
  stripes: rows are what you scan in a log/status table; column alignment
  does the vertical work for free. Zebra earns its place around ~8+ dense
  columns — not here.
- Headers `text-xs font-medium text-muted-foreground`: same "labels
  whisper" pattern as card headers — data is the content, chrome recedes.
- `align-top` on cells: multi-line cells (a wrapped log message) should
  hang from the top line, not float mid-row.
- Row hover tint: eyes track rows across 5+ columns badly; a hover
  highlight is a reading aid, not decoration.

### Empty and Error are designed states, not fallbacks

- **EmptyState** says what *would* be here and offers the next action
  ("No logs yet — trigger a post"). A blank panel makes users doubt the
  app; an empty state makes them do the thing that fills it.
- **ErrorState** = `role="alert"` (screen readers announce it), human
  title, technical detail in mono (it's data — copy-pasteable), optional
  retry. Retry button is `secondary`, not primary: the error panel itself
  is already loud; two loud things compete. Red-tinted panel reuses the
  Badge tint pattern (50-bg / 700-800-text).

---

## T6 — Kitchen sink (2026-07-11)

- A living style guide beats a static one because it *breaks visibly*: any
  styling regression shows up on one page before it shows up scattered
  across five. It's also where new components must appear first — if a
  component is awkward to demo here, its API is awkward.
- Placed at `/kitchen-sink` under a separate `aria-label="Development"` nav
  section, pinned to the sidebar bottom (`mt-auto`), `text-xs`, hidden on
  mobile: it must be reachable but must not read as part of the product.
  Visual demotion (smaller, bottom, muted) is how "for developers only"
  is said without a lock.
- Sections are `Card`s in a responsive `xl:grid-cols-2` grid — the sink
  dogfoods the layout primitives it demonstrates; the table card spans both
  columns (`xl:col-span-2`) because wide data is its whole point.
- The loading button is interactive (click → 1.5s spinner) rather than a
  frozen `isLoading` prop: state transitions are where loading UIs break
  (layout shift when the spinner appears), and you only see that live.
- Sample data is *domain* data (correlation IDs, service names, a DLQ
  failure message) not lorem ipsum: realistic content lengths expose
  truncation/wrapping problems fake text hides — the long failure message
  in the table is there deliberately.

---

## T7 — Data layer (2026-07-11)

Not styling, but the decisions that make the styled states *reachable*:

- **TanStack Query** because loading/error/empty are first-class states in
  it — `isPending` maps to Skeleton, `error` to ErrorState, empty data to
  EmptyState. The design system's states plug straight into the data
  layer's state machine; hand-rolled `useEffect` fetching is where "forgot
  the error state" bugs come from.
- Query defaults: `staleTime: 5s` (live-ish dashboard without hammering the
  gateway), `retry: 1` (a dev stack that's down stays down — fail fast into
  ErrorState instead of spinning three times), `refetchOnWindowFocus: true`
  (alt-tab back to the dashboard = "what's the state now?" — refetch *is*
  the feature).
- **`apiFetch` normalizes every failure into `ApiError{status, message}`** —
  including Nest's `message: string[]` validation shape — so ErrorState
  always has something human to show. The alternative (each call site
  interpreting response bodies) scatters that logic across every feature.
  `credentials: 'include'` lives here once, because the gateway's session
  cookie is the only auth this app has.
- **`useSse` reports status, never re-dials**: EventSource reconnects on
  its own; a hook that closed + reopened on error would fight the browser.
  Status exists purely so the Logs page can show a "reconnecting…" banner.
  `url: null` = disconnected-by-design (stream paused). Latest-callback ref
  so consumers can pass inline closures without resubscribing the stream
  every render.
- **Socket factory is lazy** (`autoConnect: false`): notification-service
  verifies a gateway-minted ticket at handshake (ADR-0007), so the caller
  must fetch the ticket *first* — the factory makes the wrong order
  unrepresentable by not connecting on creation.

---

## T11 — Status page (2026-07-12)

### Form before color (dataviz method)

Each data block got the *form* its job demands, not a chart by default:
- Outbox counts = **stat tiles** (a handful of headline numbers → KPI row,
  never a grouped bar chart). Tile contract: sentence-case label, semibold
  value, optional hint underneath.
- Service health = **badge grid** (state, not magnitude — status colors).
- Queue depths = **table** (per-row identity + three numbers; a bar chart
  of five queues would just be a slower table).

### tabular-nums on every refreshing number

The page repaints every 5s. Proportional digits change width when values
change (a `1` is narrower than a `4`), which makes tiles and table columns
wiggle on every poll. `tabular-nums` gives fixed-width digits — the number
updates, nothing moves. Any surface that re-renders numbers in place wants
this.

### Status color = state, never decoration

`quarantined` turns red *only when > 0* — a red zero would cry wolf, and
the tile also gains a "needs manual replay" hint (color never alone). Same
rule in the queue table: `.dlq` totals go red only when non-zero. Everything
healthy renders quiet; the page is designed so problems are the only loud
thing on it.

### Partial failure is layout, not an exception

The snapshot's sections fail independently (a dead RabbitMQ must not blank
the service grid), so each card handles its own `ok: false` with an inline
ErrorState. The only full-page error is the gateway itself being
unreachable. Skeletons mirror the loaded layout card-for-card, so first
paint and loaded paint have identical geometry — no reflow jump.

### Polling honesty

`refetchInterval: 5000` with the caption saying so ("Refreshes every 5s") —
a monitor that silently polls looks static and untrustworthy; a spinner on
every poll is noise. Quiet refresh + stated cadence + `tabular-nums` keeping
the update motionless is the middle path.

---

## T12 — Auth gate (2026-07-12)

### One gate at the app boundary, not per-page guards

The whole dashboard is session-scoped (dev endpoints require it), so auth
is a single `AuthGate` above the router — no per-route guard to forget on
the next page. Three distinct states, deliberately distinct visuals:
**checking** (centered spinner — never flash the login form at someone who
IS logged in), **anonymous** (login screen), **gateway unreachable**
(ErrorState — "the backend is down" and "you're logged out" are different
facts and must not share a screen).

### 401 is data, not an error

`useMe` catches `ApiError(401)` and returns `null`. If 401 flowed through
the error channel, the query layer would treat "anonymous" as a failure —
retries, error UI, noise. Encoding it as a value makes the three-state
gate a plain `if` chain. General lesson: expected domain states don't
belong in the exception path.

### Login screen craft notes

- Centered single card, `max-w-sm`: a two-field form gets a narrow column —
  full-width inputs on a wide screen look broken.
- Brand text sits *above* the card, quiet: this is an internal tool's door,
  not a marketing page.
- Server error surfaces through the password `Field`'s error slot — the
  message appears where the user's eye already is, and the field turns red
  via the same wiring every other form uses (T5).
- Register chains an automatic login: "create account" should land you
  *inside* the app, not on a second form. The mode toggle is one line of
  text, because login vs. register is a fork, not two features.
- Submit `Button className="w-full"`: on a narrow card the full-width
  button doubles as the form's visual footer.

### Logout placement

Sidebar bottom, `ghost` variant, next to the truncated email: identity +
exit belong together, and logout must never compete visually with real
actions (it's the least-used button in the app). Logout also clears the
whole query cache — cached status/posts belong to the ended session.

---

## T13 — Trigger page (2026-07-12)

### Two-column: cause on the left, effect on the right

Form and "Fired this session" sit side by side (`xl:grid-cols-2`,
`items-start` so the short card doesn't stretch): fire → the result appears
next to your cursor's mental position, not below the fold. On narrow
screens they stack, form first — cause before effect.

### The correlationId is the product of this page

The gateway returns it as a response *header*, so `apiFetch` grew a
`apiFetchWithHeaders` variant instead of every caller re-implementing the
fetch. In the history row the id renders `font-mono`, truncated with the
full value one Copy away — IDs are for machines; the human needs *recency*
(newest first, timestamp) and the *route onward* (Trace link). Preview text
capped at 80 chars: the row identifies the post, it doesn't display it.

### Feedback in place, not in a toast

- Copy button flips its own label ("Copy" → "Copied", 1.5s): feedback at
  the point of action. A toast for a clipboard write is a cannon for a fly.
- Submit errors surface in the Content field's error slot — same wiring as
  login (T12), same red, zero new patterns.
- On success the form clears (ready for the next test shot) and the new
  row appears at the top of the list — the state change *is* the success
  message; no "Post created!" banner needed.

### Textarea joins the control contract

Same border/focus/invalid skin as Input; `resize-y` only — vertical growth
is useful, horizontal drag breaks the grid. `maxLength` mirrors the
backend's 10k cap (defense in depth: the DTO still enforces it server-side;
the attribute just saves a round-trip).

---

## T17 — Logs page (2026-07-12)

### Filter bar as a row of labeled controls, not a form

No submit button: filters apply as you type/select (the query key includes
them, so TanStack refetches on change). A "Apply" button would add a step
to an operation the user does dozens of times while debugging. Fixed widths
per control (`w-72` for the mono ID, `w-52`/`w-36` for selects) instead of
a grid: a filter bar reads left-to-right by importance — correlationId
first, it's the dashboard's primary key.

### Live mode: color only the level word

A log table's loudness budget is tiny. Level word gets the color
(`error`/`fatal` red, `warn` amber, `debug`/`verbose` muted), everything
else stays ink — a fully-tinted error row would make three errors look like
an emergency wall. Timestamp shows `HH:MM:SS.mmm` only (the date is almost
always "today" in a dev tool; milliseconds matter for ordering pipeline
hops). `break-all` on messages: correlation ids and JSON fragments have no
natural word boundaries; without it one long token forces the whole table
to scroll.

### Live vs. query are different data paths, same table

Query mode asks Redis (server-side filter, bounded scan); live mode
subscribes once and filters client-side — re-subscribing the EventSource on
every filter keystroke would drop entries mid-look. The Go live button flips
`secondary → primary` with a ● dot: state you can see from across the room.
Live buffer capped at 500 entries (newest first) so an hour of streaming
can't eat the tab's memory. The reconnect banner rides on `useSse`'s status
— the browser reconnects by itself; the UI only *tells* you it's happening
(quiet amber, `role="status"`, not an ErrorState — the stream heals).

---

## T18/T19 — Trace (2026-07-12)

### The trace is a *derivation*, not infrastructure

Eight stage-marker log lines (one per pipeline hop, each ending
`correlationId=<id>`) plus a pure function `deriveTrace(entries)` — no
OpenTelemetry, no span store. The stage definitions match on
service+context (and broker name for the relay's two publishes), so the
whole feature is testable as data-in/data-out; the page is just a renderer
over it. When OTel arrives someday (ADR-0013 deferral), only the derivation
swaps.

### Vertical timeline, not a horizontal pipeline diagram

Hops are sequential and each carries text (log lines, latency); vertical
lists scale to any content height and read top-to-bottom like the logs they
come from. A horizontal boxes-and-arrows diagram looks like the README
architecture art but fits ~0 lines of evidence per stage. Timeline
mechanics: per-row connector line (`absolute` hairline that skips the last
row), dot = state (filled emerald done, filled red failed, hollow border
pending), *whole row* at `opacity-50` when pending — the unreached future
is visible but muted, so progress reads as the page "filling in".

### Latency chips: delta, not absolute time

`+1.95s` next to a stage answers the actual question ("where does the time
go?"); absolute timestamps answer nothing you can't get in Logs. The chip
is mono muted — data, not decoration. Page header shows total once settled.

### Polling that knows when to stop

`refetchInterval` is a function: 2s while the chain is in flight, `false`
once settled (all stages done, or any stage errored). A monitor that keeps
polling a finished trace is noise; one that stops early misses the tail.
The in-flight state is *announced* ("Message in flight — refreshing every
2s…", `role="status"`) — same polling-honesty rule as the Status page.
