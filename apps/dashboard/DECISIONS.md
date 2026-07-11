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
