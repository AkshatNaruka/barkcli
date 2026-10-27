# Bark native UX overhaul

Status: implementation plan
Branch: `feat/native-ux`
Reference: T3 Code screenshot supplied 2026-10-27 (layout and density only — no
brand assets, copy, or code are copied).

## Decision

Bark stays a **Tauri v2 + one React UI** product. The Bama workflow is the
process reference: study a real app, write the screen index and user stories,
build one story at a time, and snapshot light/dark before calling it done. It is
not a reason to fork the stack into SwiftUI.

Browser and desktop must keep using the same routes and components. A change is
not finished if it only exists in one shell.

## What the reference gets right

T3 Code reads as a tool, not a landing page:

- Three columns with a clear job: **navigate → converse → verify**.
- Flat panes with 1 px rules. Almost no nested cards, gradients, or decorative
  chrome.
- A dense left rail: search, project/board context, grouped threads, status,
  time, and nothing that requires a second click to understand.
- A centre column that behaves like a document: prose first, code and metadata
  in mono, one clear composer at the bottom.
- A right workbench that earns its width with a real artifact (diff, file tree,
  line numbers), not a summary panel.
- Controls are quiet until hovered or focused. The primary action is the only
  saturated element.
- Small type with generous line-height; information density is the aesthetic.
- Keyboard shortcuts are visible where they matter (`/`, `⌘K`, `⌘↵`).

## Product principles

1. **Content first.** Empty space is fine; decoration around empty space is not.
2. **One accent.** Copper is for selection, primary action, and live state only.
3. **Hairlines, not cards.** Use borders and spacing to group. Reserve raised
   surfaces for dialogs, menus, and the composer.
4. **Truthful controls.** Do not render a button, tab, or status that has no
   behaviour.
5. **Show the work.** Plans, diffs, gates, and agent runs are first-class
   artifacts. They are not hidden behind a generic "details" card.
6. **Native restraint.** Compact 11–13 px UI type, 1.5–1.65 line-height,
   system font for prose, mono for ids/commands/times.
7. **Keyboard is a feature.** Every pane can be reached without a mouse; every
   shortcut is discoverable.
8. **Accessible by construction.** Visible focus, labels, contrast, reduced
   motion, and semantic landmarks.

## Target layout

```
┌──────┬─────────────────────────────┬──────────────────────────────┐
│ rail │ context / threads           │ thread                       │
│ 56   │ 312                         │ flexible                     │
│      │                             │                              │
│ chat │ board switcher   search     │ breadcrumb       workbench   │
│ board│ ─────────────────────────── │ ───────────────────────────  │
│ agent│ needs you          2        │ conversation / document      │
│ ...  │ ○ thread title      4m      │                              │
│      │ ○ thread title      2h      │                              │
│      │ running            1        │                              │
│      │ ...                         │                              │
│      │                             │ ┌──────────────────────────┐ │
│      │                             │ │ composer          send ↑ │ │
│      │                             │ └──────────────────────────┘ │
└──────┴─────────────────────────────┴──────────────────────────────┘
                                       ┌────────────────────────────┐
                                       │ workbench  plan diff gate  │
                                       │ diff / plan / gate / ctx   │
                                       │ (collapsible, 400 px)      │
                                       └────────────────────────────┘
```

- Rail: 56 px. Chat, Board, Agents at the top; Brain, Skills, Operations,
  History below a hairline; Appearance and Settings pinned to the bottom.
- Chat navigator: 312 px. Board switcher + search + New intent at the top;
  grouped threads scroll; server/appearance affordances at the bottom.
- Conversation: fluid, content max-width 760 px, 24–32 px gutters.
- Workbench: 400 px, collapsible, remembers its state. Hidden below 1180 px
  and available from the thread header.
- Navigator hides below 900 px and opens as a drawer. Tauri's minimum window
  remains 1040 px, so desktop always keeps conversation + workbench.

## Type and tokens

| Role | Size / treatment |
| --- | --- |
| App title / thread title | 13–15 px, 600, −0.01em |
| Body / messages | 13 px, 1.65, regular |
| Navigation labels | 12–13 px, 500 |
| Metadata, ids, times | 10–11 px, mono, muted |
| Section labels | 10 px, uppercase, 0.14em |
| Code / diff | 11 px mono, 1.6 |
| Primary controls | 12 px, 500 |

Spacing follows a 4 px grid. Component radii: 6 px controls, 8 px composer,
10 px dialogs. No pill-shaped body controls.

Existing six themes and seven accents remain. The redesign changes geometry and
hierarchy, not the appearance system.

## Screen stories

### S1 — Scan and start (Chat)

- I can see the active board and switch boards without leaving Chat.
- I can search threads by title, id, or backend with `/`.
- Threads are grouped by **Needs you**, **Running**, **Drafts**, **Settled**;
  each group has a count and collapses only when empty.
- The selected thread is obvious without a saturated full-width background.
- `⌘N` opens the intent composer. `⌘K` opens the command palette.

### S2 — Read a thread

- The header gives board / thread context and status, plus workbench toggle.
- Human prompts are quoted, not chat bubbles. Agent output is prose.
- Plan proposals are flat, numbered, and actionable; they do not look like a
  dashboard widget.
- Task runs, gate results, and merges render as compact status rows with real
  actions.
- The composer stays anchored and shows the backend and send shortcut. Enter
  sends; Shift+Enter adds a line.

### S3 — Verify in the workbench

- Tabs: Plan, Diff, Gate, Eval, Context. The active tab is a text label with a
  hairline underline, not a pill.
- Diff has a file list, per-file add/delete counts, hunk headers, line numbers,
  and readable green/red line treatment. No raw `<pre>` blob.
- Plan lists tasks and acceptance criteria; Gate shows verdict, command, and
  log; Context shows the living context with copy.
- Empty states explain the next action in one sentence.

### S4 — Move around the product

- `⌘1…7` follows the visible rail order.
- Non-chat surfaces keep the same rail, typography, borders, and inspector.
- The existing Board, Agents, Brain, Skills, Operations, and History functions
  remain reachable; no route is removed.

### S5 — Desktop feels native

- The Tauri window uses the app's dark surface, a sensible minimum size, and
  restores the last window geometry when the platform supports it.
- The shell kills its sidecar on quit and never leaves a stray server.
- The bundled `.app` serves the same asset tree as the browser build.
- Native menu/keyboard commands do not conflict with web shortcuts.

## Milestones

### M1 — Shell and Chat

- [ ] App rail hierarchy, counts, focus states, tooltips.
- [ ] Chat navigator: board switcher, search, grouped threads, empty/loading.
- [ ] Thread header, prose event treatment, plan/run/gate rows.
- [ ] Composer: backend, shortcut, sending/empty states.
- [ ] Responsive collapse for navigator/workbench.
- [ ] Demo threads and a real diff fixture for QA.

### M2 — Workbench

- [ ] Unified diff parser + file/hunk/line renderer.
- [ ] Plan, Gate, Eval, Context panels restyled.
- [ ] Workbench collapse persistence; keyboard toggle.
- [ ] Loading, error, and empty states.

### M3 — Product shell

- [ ] Non-chat surfaces inherit the new rail, header rhythm, and inspector.
- [ ] Command palette visual pass; visible shortcut map.
- [ ] Dialog/focus management and reduced-motion pass.

### M4 — Desktop

- [ ] Tauri window chrome/background and minimum geometry.
- [ ] Native menu / shortcut alignment where it adds value.
- [ ] Rebuild `.app`, verify bundled assets, launch smoke test, clean exit.

### M5 — Tests and evidence

- [ ] Unit: route aliases, appearance serialization, thread grouping, diff parser.
- [ ] Component: navigator search/grouping, composer submit, workbench tabs.
- [ ] E2E: demo Chat/Board/Agents/History in light and dark; no console errors.
- [ ] Screenshots at 1440×900 and the Tauri minimum 1040×680.
- [ ] `npm run test`, `npm run build`, `cargo test`, Tauri release bundle.

## Acceptance criteria

- No feature from the seven surfaces is removed or hidden behind a regression.
- Chat is legible and operable at 1040 px wide; the workbench can be collapsed.
- Every interactive icon has an accessible name and visible focus.
- There are no nested card stacks in the primary Chat path.
- All tests pass from a clean checkout; the desktop bundle contains
  `web/dist/assets/index.js` and the sidecar.
- No server or daemon is left running after verification.

## Non-goals

- Replacing Tauri with SwiftUI.
- Changing the board/task data model or `.board` files.
- Copying T3 Code's brand, copy, or proprietary UI.
- Building a second frontend for desktop.
