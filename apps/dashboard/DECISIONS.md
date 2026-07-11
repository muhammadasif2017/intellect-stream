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
