# Cockpit UI — Design Spec

> **Date:** 2026-10-30 · **Scope:** `web/` only · **Base:** `fcfd2fd` (workbench + verified merges)
> **Status:** approved by product owner; implementation in progress.

## 1. Problem

The workbench update made the thread the center of the product, but the UI still
reads as a chat app with a drawer:

- The sidebar exposes 2 of 9 surfaces (Build, Review). Board, Agents, Brain,
  Skills, Operations, History, and Project tools are hidden behind ⌘J, the
  command palette, or undocumented number keys.
- The thread screen has no phase model. `needs you / waiting / draft / settled`
  are text-only; a plan with **0 steps** still shows a filled
  “Approve plan & build”; the empty state is a small block floating in ~600px
  of canvas.
- Type is under-scaled (≈90% of text is 11–13px), surfaces use three different
  page gutters, and eight button styles coexist.
- Light-theme semantic text fails WCAG AA: success 3.32:1, warning 3.57:1,
  accent-text on surface 4.38:1.
- Several icon-only targets are 17–24px.

The goal is a **cockpit for delegated work**: the human can answer “what is
running, what needs me, what is ready to merge” in five seconds, and every
thread shows the same `Intent → Plan → Build → Verify → Merge` loop.

## 2. Goals / non-goals

**Goals**

1. Make the workspace discoverable from the sidebar (≤7 primary items).
2. Give every thread a derived phase + status (color, dot/stripe, label).
3. Rebuild the thread’s key states: empty, plan review, running, gate, merged.
4. A coherent type/spacing/color system with AA contrast in both themes.
5. Keep the warm-paper/copper identity and the existing workbench model.

**Non-goals**

- No backend, API, CLI, or data-model changes. Phase is derived from existing
  `ThreadSummary`, `ThreadDetail`, `RunRecord`, and `plan_proposed` events.
- No new npm dependencies.
- No route rewrites; legacy hashes keep working.
- No change to the agent execution semantics (approve/retry/merge still call the
  same endpoints).

## 3. Evidence

Audited with a built `web/dist` at 1440×900, 1024×800, and 390×844 in both
themes; contrast computed from the tokens in `web/src/lib/theme.tsx`.

| Finding | Measurement |
|---|---|
| Surface discoverability | 2 / 9 surfaces in the sidebar |
| Palette default | 6–7 ungrouped rows; “Go to …” only after typing |
| Type distribution (thread) | 45 elements at 12px, 16 at 13px, one 24px heading |
| Light contrast | success 3.32, warning 3.57, accent-text on surface 4.38 |
| Targets | thread “…” 24px, “Change” 23px, “Provider settings” 17px |
| Empty columns | Board DOING column consumes ~320px with “No cards” |
| Duplicate copy | Review rows repeat “Nothing has been built yet” |
| Off-palette | History chart uses saturated green/cyan |
| Baseline | build green, 70/70 tests pass |

## 4. Design

### 4.1 Shell and navigation

```
Sidebar (248–300px, resizable)
  Project block: name, path (truncate), git branch + live dot, Change
  New thread (⌘N)
  WORKSPACE
    Build
    Review            [count]
    Board
    Agents            [live count]
    Brain
    More…             Skills · Operations · History · Project tools
  THREADS
    Search (/)
    Needs you (n)     status-sorted rows
    Working (n)
    Drafts (n)
    Completed (n)     collapsed + dimmed
  Footer: search · Settings · Help
```

- **Five primary destinations + More.** Build and Review keep their meaning;
  Board and Agents become top-level because the product is a management layer
  for parallel work. Brain completes the knowledge loop.
- **Thread rows:** 36–40px with a status dot, one-line title, one-line context
  (last event or gate reason), and an always-visible relative time. Merged rows
  are dimmed, never hidden. The `…` menu stays at 28×28 minimum.
- **One header pattern for every surface** (48px): breadcrumb/title left;
  search (⌘K), quick open (⌘P), inspector (⌘J) right. The thread header adds
  its own phase/action strip but shares the type, height, and gutters.
- **Command palette front page:** grouped `Go to`, `Actions`, `Threads`,
  `Cards`; all rows have icon + label + optional description + shortcut chip.
  Navigation is listed with an empty query.

### 4.2 Phase model (derived, no API changes)

```ts
type Phase = "intent" | "plan" | "build" | "verify" | "merge" | "done";
type Tone  = "copper" | "live" | "success" | "danger" | "muted";
```

Derivation order (first match wins), from existing data:

1. `card.column === "done"` / run `merged` → `done` (muted/green, dimmed).
2. Active run (`queued|starting|running|waiting`) → `build` (`live`).
3. Latest run failed / gate failed → `verify` (`danger`).
4. Gate passed, not merged → `merge` (`success`).
5. Latest `plan_proposed` not approved → `plan` (`copper`, needs you).
6. Otherwise → `intent` (muted).

The thread row, thread header, phase rail, review row, and board card read from
the same helper (`web/src/lib/phase.ts`) so labels never diverge.

| State | Color | Marker | Label |
|---|---|---|---|
| Needs you | copper | dot + 2px left stripe | `Needs you` |
| Working | live blue | pulsing dot | `Working` |
| Ready | green | dot | `Ready to merge` |
| Failed | red | dot + 2px left stripe | `Tests failed` |
| Draft | gray | dot | `Draft` |
| Done | dimmed | dot | `Merged` |

Color is never the only signal: label + dot/stripe always accompany it.

### 4.3 Thread screen

**Header**

- Line 1: `project / thread` breadcrumb (12px muted) + status pill.
- Line 2: title 15px/600 + branch/elapsed meta; primary action right
  (`Approve plan`, `Review changes`, `Merge`) + `…`.
- Line 3: phase rail `Intent · Plan · Build · Verify · Merge`; current step
  copper, complete green, future muted. Collapses to the pill below 1100px.

**Transcript**

- 760px column, 24px rhythm, `content-visibility` kept.
- User: `You` 12px muted label, body 14/1.65 text, left rule 1px border.
- Agent: 20px mark, name + 12px time, body 14; no bubbles.
- System events: one-line 12px with icon and time; details behind a disclosure.
- Plan and run artifacts: elevated `surface` cards with an 8px radius and a
  status stripe; not `border-y` lines.
- Sticky “Jump to latest” stays.

**Plan card**

- Header: `Plan · N steps`, source badge (`Bark plan` / provider), status pill.
- Steps: number, title, description, effort, acceptance line, file chips;
  0 steps shows a warning callout (“The agent will build from the intent”).
- Meta grid: Build with / Workspace / Checks; checks missing shows an inline
  warning with a link to Build options.
- Footer: `Request changes` (ghost) + `Approve & build` (primary). Disabled
  only when no agent is ready or a run is active; the 0-step case warns but
  stays actionable.

**Composer**

- 760px, 10px radius, 1px border, accent focus ring.
- `Ask / Build` segmented control with helper text; dynamic submit label
  (`Ask` vs `Plan changes`); agent picker; `⌘⏎`.
- Read-only threads show a lock state and a single-line reason.
- Error/readiness messages sit above the controls, not below the fold.

**Empty state**

- Center a 680px block: 24px headline, 14px subtitle, composer.
- Below: a 3-step explainer (`Plan → Build in an isolated worktree → Gate &
  merge`) and up to 3 suggested starts derived from real cards (blocked, high
  priority, or recent drafts). Hidden below 800px height.

### 4.4 Inspector

- Default header: `Thread workbench` + close.
- Summary card: phase, next action, branch, checks, changed-file count.
- Surfaces: `Plan`, `Changes (n)`, `Checks (state)` primary; `More` reveals
  `Evidence`, `Diagnostics`, `Context`. 28px rows, key chips kept.
- Panel mode: sticky tab strip, back to thread summary, close; no blank pane.
- Width 360 default, 560 max; resize handle unchanged.
- No thread: `Project` shortcuts (`Board`, `Agents`, `Project tools`).

### 4.5 Review, Board, Agents

**Review**

- Group by decision: `Needs your decision`, `Waiting on agents`,
  `Recently merged`.
- Row: title, phase pill, gate summary, diff stats (`+n -n · f files`), age,
  primary `Open review`.
- Empty state: “Nothing needs review” + `Start a thread`.
- Fixes the “No build yet · plan only / Nothing has been built” duplication.

**Board**

- Sticky column headers with count + `+`; empty columns show one CTA in the
  primary column instead of repeated “No cards”.
- Card anatomy: title (2 lines max), meta row (priority dot, labels, assignee,
  due), gate/phase chip, spec link. Priority is muted for done cards.
- Right rail `Now` keeps live/stalled/action tiles; adds the top “needs you”
  thread with a direct open action.

**Agents**

- Roster sorted working → idle → offline; status dot + label, current task,
  load, and a `Dispatch task` primary. Role library collapses.
- Light pass only; no behavior changes.

### 4.6 Design system

**Type**

| Role | Size | Weight | Use |
|---|---|---|---|
| Display | 32 | 700 | first-run headline only |
| H1 | 24 | 600 | empty-state / page title |
| H2 | 18 | 600 | panel title |
| Row title | 15 | 500 | thread header, card title |
| Body | 14 | 400 | transcript, descriptions |
| Control | 13 | 500 | buttons, nav, inputs |
| Caption | 12 | 400 | metadata, timestamps |

Inter for UI; JetBrains Mono for IDs/hashes/counts; `tnum` on times and counts.

**Spacing / shape**

- 4px scale: 4, 8, 12, 16, 24, 32, 48.
- Radii: 6 controls, 8 cards, 12 dialogs, 999 pills.
- Shadows: one dialog/drawer shadow; no card shadows.
- Page gutters: 24px compact, 32px comfortable; reading max 760, surfaces 1120.

**Color**

Keep paper/copper. Add `--live` (dark `#5aa7cf`, light `#2b7aa2`) and darken
light-mode text semantics to pass AA:

- success text: light `#2f7d5b` (4.9), dark `#46b585`
- warning text: light `#8a5a00` (5.2), dark `#d99a2b`
- danger text: light `#b23a27` (5.0), dark `#e0563f`
- accent text: light `#8a4a22` (5.5), dark `#e7a173`

Copper is reserved for: needs-you status, primary action, active surface.
Blue = running/neutral progress; green = passed/merged; red = failed; gray =
idle/draft.

**Buttons** — primary / secondary / ghost / danger; sizes 28 / 32 / 36; all
icon-only buttons ≥28px with `aria-label`. Focus ring 2px accent.

### 4.7 Files

| File | Change |
|---|---|
| `web/src/lib/phase.ts` (new) | Phase/tone derivation + labels |
| `web/src/lib/threads.ts` | Use phase helper for status/tone |
| `web/src/index.css` | Tokens, type scale, primitives, contrast |
| `web/src/lib/theme.tsx` | Semantic light/dark tokens, `--live` |
| `web/src/shell/WorkspaceSidebar.tsx` | Workspace nav, thread row anatomy |
| `web/src/App.tsx` | Unified header, palette/nav wiring |
| `web/src/components/CommandPalette.tsx` | Grouped front page, nav rows |
| `web/src/threads/ThreadPane.tsx` | Header, phase rail, plan card, composer, empty |
| `web/src/shell/SurfacesPanel.tsx` | Summary card, grouped surfaces |
| `web/src/shell/InspectorPane.tsx` | Sticky tabs, grouping, back-to-thread |
| `web/src/components/ReviewQueuePanel.tsx`, `web/src/shell/ReviewSurface.tsx` | Review inbox |
| `web/src/components/BoardView.tsx`, `KanbanCard.tsx`, `KanbanColumn.tsx` | Board anatomy |
| `web/src/shell/AgentsSurface.tsx` | Roster light pass |
| `web/src/components/CommandPalette.tsx` | Grouping + default nav |
| tests | Update labels/tones; add phase + nav tests |

## 5. States

- **Loading:** skeleton rows at the same height as content (no layout shift).
- **Empty:** one headline + one primary action + optional explainer; never
  repeated per column.
- **Error:** plain-language cause + retry + “your draft is saved” where true.
- **Read-only:** lock icon + one-line reason; Ask remains available.
- **Offline:** connection notice stays at the top of the transcript; actions
  disable with a reason.

## 6. Testing & acceptance

- `cd web && npm run build` green; `npx vitest run` green (update expectations
  where labels/tones intentionally change).
- New tests: phase derivation (intent/plan/build/verify/merge/done), nav rows
  and aria-current, palette default includes `Go to`, plan empty warning.
- Visual acceptance (Playwright screenshots, light + dark):
  - 1440×900: sidebar nav, thread plan review, thread running, board, review.
  - 1024×800: inspector collapses/focuses correctly; header does not wrap.
  - 390×844: drawer nav, composer controls stack, no horizontal scroll.
- Contrast script: all normal text ≥4.5:1, large text/indicators ≥3:1 in both
  themes.
- No console errors; keyboard: ⌘K, ⌘J, ⌘N, ⌘⏎, 1–5 all work.

## 7. Risks

- **IA change:** adding Board/Agents to the sidebar reduces thread-list height.
  Mitigation: collapsible `More`, 36px rows, Completed collapsed by default.
- **Status duplication:** `status_group` already exists; the new phase helper
  must be the single source. Mitigation: tests cover row/header/review parity.
- **Copper overuse:** reserve it; the research is explicit that decorative
  copper destroys the needs-you signal.
- **Light-theme warmth:** keep neutral chroma low; test on paper-like displays.
- **Large ThreadPane:** avoid a rewrite; extract header/plan/composer blocks
  only where needed, keep behavior identical.
