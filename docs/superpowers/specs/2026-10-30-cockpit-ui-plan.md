# Cockpit UI — Implementation Plan

> Companion to `2026-10-30-cockpit-ui-design.md`. Scope: `web/` only.
> Each phase ends green (`npm run build`, `npx vitest run`).

## Phase 0 — Tokens & primitives

**Files:** `web/src/index.css`, `web/src/lib/theme.tsx`, `web/tailwind.config.js`

1. Add semantic tokens to both palettes: `--live`, `--live-soft`,
   `--success-text`, `--warning-text`, `--danger-text`, `--accent-text`.
2. Replace the font-size remap hack with the approved scale (12/13/14/15/18/24/32);
   keep the Chinese/emoji-safe fallback stack.
3. Define primitives: `.bark-btn` (primary/secondary/ghost/danger, sizes),
   `.bark-pill` (tone variants), `.bark-row`, `.surface-card`, `.page`
   (`max-width` + gutters), `.kbd`.
4. Fix `:root` duplicate `:focus-visible` block; keep one 2px accent ring.
5. Add `tnum` utility; use mono + tabular for counts/times.

**Verify:** contrast script (all normal text ≥4.5), build green, existing tests green.

## Phase 1 — Shell & command palette

**Files:** `web/src/shell/WorkspaceSidebar.tsx`, `web/src/App.tsx`,
`web/src/components/CommandPalette.tsx`, `web/src/lib/commands.ts`, `web/src/index.css`

1. Sidebar: project block (branch + live dot), `New thread`, **Workspace** nav
   (Build, Review, Board, Agents, Brain, More), thread search + grouped rows,
   footer. 28px minimum icon targets.
2. `More` disclosure lists Skills, Operations, History, Project tools and closes
   on navigate; `aria-current` on all nav rows.
3. Thread rows: status dot + title + one-line context + always-visible time;
   Completed dimmed and collapsed.
4. Unified header in `App.tsx` for non-chat surfaces; chat keeps the thread
   header but matches height/type.
5. Palette: group `Go to` / `Actions` / `Threads` / `Cards`; show surface
   navigation with an empty query; add shortcut chips; add
   `Go to Board/Agents/Brain/Review`.

**Verify:** keyboard 1–5 + ⌘K, `aria-current`, nav tests.

## Phase 2 — Phase model & thread loop

**Files:** `web/src/lib/phase.ts` (new), `web/src/lib/threads.ts`,
`web/src/threads/ThreadPane.tsx`, `web/src/shell/SurfacesPanel.tsx`,
`web/src/shell/InspectorPane.tsx`, `web/src/lib/workbench.ts`

1. `phaseFromThread(summary, detail?)` + `phaseTone` + labels; export
   `PHASES` for the rail. Fall back to `status_group`/`column` when no detail.
2. Thread header: breadcrumb, title, status pill, meta, primary action, overflow.
3. Phase rail component (pure CSS, collapses <1100px).
4. Transcript: 760px column, user/agent/system rhythm, artifact cards with status
   stripe; keep `content-visibility`.
5. Plan card: header/source/status, numbered steps, meta grid, 0-step warning,
   checks-missing warning, sticky footer actions.
6. Composer: Ask/Build helper text, dynamic submit, lock state, `⌘⏎`; no
   duplicate “Ask” verb.
7. Empty state: centered block + 3-step explainer + up to 3 suggested starts.
8. Inspector: summary card (phase, next action, branch, checks, files) above
   surfaces; grouped tabs (Plan/Changes/Checks + More); back-to-thread.
9. `SurfacesPanel`: counts/status on Changes/Checks; keep letter chips.

**Verify:** phase unit tests; plan empty warning test; screenshots of empty,
plan review, running, gate, merged.

## Phase 3 — Review, Board, Agents

**Files:** `web/src/shell/ReviewSurface.tsx`, `web/src/components/ReviewQueuePanel.tsx`,
`web/src/components/BoardView.tsx`, `web/src/components/KanbanCard.tsx`,
`web/src/components/KanbanColumn.tsx`, `web/src/shell/AgentsSurface.tsx`,
`web/src/index.css`

1. Review: decision groups; row anatomy (phase pill, gate, diff, age, action);
   empty state; remove duplicated “nothing built” copy.
2. Board: sticky headers with count + `+`; one empty-column CTA; card meta row
   with phase/gate; mute priority on done; keep drag/drop behavior unchanged.
3. Agents: status-first roster, current task, load, `Dispatch task` primary;
   role library collapsed.
4. Now rail: top needs-you item opens the thread.

**Verify:** screenshots board/review/agents; existing tests updated.

## Phase 4 — Secondary surfaces & mobile

**Files:** `web/src/components/HistoryView.tsx`, `web/src/components/BrainView.tsx`,
`web/src/shell/OperationsView.tsx`, `web/src/components/SkillsView.tsx`,
`web/src/shell/ProjectHub.tsx`, `web/src/index.css`

1. Replace off-palette chart colors with `--live`/`--success`/`--accent` tokens.
2. Collapse repeated history events by session; keep day headers.
3. Brain: default focus mode, reduce repeated labels; consistent canvas token.
4. Operations/Skills/Hub: shared page gutters, stat tiles, section headers.
5. Mobile: drawer nav, 44px targets, composer stacking, no horizontal scroll.

**Verify:** 1024 + 390 screenshots, no overflow.

## Phase 5 — Proof

1. `cd web && npm run build`
2. `cd web && npx vitest run` (update label/phase expectations intentionally)
3. Contrast audit script over both palettes.
4. Playwright screenshots: 1440 light/dark (empty, plan, board, review, agents),
   1024 thread, 390 chat.
5. Manual keyboard pass: ⌘K, ⌘J, ⌘N, ⌘⏎, 1–5, `/`, Tab/Shift+Tab, Esc.
6. Commit in logical slices; no backend changes.

## Rollback

Each phase is independently revertible. `phase.ts` is additive; no persisted
schema. If the sidebar nav proves too dense, the `More` block is the only part
to collapse.
