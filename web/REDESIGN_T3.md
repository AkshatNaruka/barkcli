# UI/UX Redesign — “T3 Code” direction

Status: active · Scope: `web/` only · Reference: T3 Code (t3.codes)

The goal is not to clone T3. It is to borrow its operating principles: near-black
neutral canvas, one job per pane, quiet chrome, dense but calm type, and a
composer that feels like the center of the product.

## Design direction

- **Canvas** — neutral graphite. No warm brown cast on the default theme.
  `#080808 / #0d0d0d / #141414`, hairline borders at `#232323`.
- **Ink** — `#ededed` primary, `#8a8a8a` secondary. Accent is monochrome
  (white fill, black ink in dark mode) so color is reserved for status.
- **Rhythm** — 4px grid; 12–14px body; 11–12px metadata; mono only for IDs,
  branches, commands, and counts.
- **Chrome** — no stacked sidebars. One 56px nav rail + one contextual pane.
  Panels are flat; elevation only for popovers/menus/dialogs.
- **Density** — thread rows are ~56px, settings rows ~52px, grouped headers
  11px uppercase-ish with tabular counts.
- **Motion** — 120–160ms, opacity/translate only, respect reduced motion.
- **Keyboard** — `⌘K`, `⌘N`, `⌘,`, `/` in composer, visible focus rings.

## Phases

### Phase 0 — Foundations (tokens + demo)
1. Add `graphite` theme (new default) and `mono` accent; keep Bark/Slate/
   Terminal/Paper/Auto for people who prefer them.
2. Retune root CSS tokens so first paint matches the theme.
3. Restyle primitives: buttons, inputs, focus, menus, scrollbars, kbd chips.
4. Static demo gets a project snapshot so Threads and Settings are explorable
   without a backend.

### Phase 1 — Threads (the product)
1. Replace the double sidebar with a T3-style shell:
   - 56px nav rail (`AppRail`): project switcher, surfaces, search,
     settings/appearance, usage.
   - 340px thread list with search, new thread, folders, and T3-style rows
     (avatar tile, two-line title, relative time, muted branch/backend).
2. Thread pane header becomes a breadcrumb (`project / thread title`) with
   Changes, branch, actions, and Inspector as quiet chips.
3. Composer becomes the visual anchor: wider card, generous radius, no hard
   inner divider, mono hints, white send button.
4. Conversation measure maxes at ~760px; user messages stay right-aligned,
   assistant text stays plain; activity/run cards flatten.
5. Inspector pane restyled as a floating card with hairline sections.

### Phase 2 — Settings
- Two-pane layout with a quiet section list and content that reads as grouped
  rows, not nested cards.
- Sections: Project, Appearance, Agents, Diagnostics. Keep all existing data
  and actions; only presentation changes.
- Theme picker becomes visual swatches; appearance opens the full customizer.

### Phase 3 — Remaining surfaces (in progress → mostly done)
- Removed the duplicated workspace topbar; surfaces now own their own headers
  (ProjectHub, BrainView, TeamView, Skills, History no longer duplicate the
  surface name). Quick open and search remain reachable from the rail.
- Agents and Brain gained a thin `.surface-tabs` sub-view strip (Team /
  Orchestration / Sprints, Graph / Memory / Context) so every sub-view is
  discoverable after the sidebar removal.
- Review rows are now single bordered cards with the "Review priority"
  disclosure nested inside instead of floating below.
- Demo banner is fully tokenized (graphite, no warm copper hardcodes).
- SurfacesPanel footer and hardcoded warm colors normalized to tokens.
- Board, Review, Skills, History, Operations, Hub, Projects keep their
  existing layouts, now without the duplicated topbar.

### Phase 4 — Verify (partial)
- `npm run build` (tsc + vite) passes; `npx tsc --noEmit` passes.
- `npm test` passes (50 files / 227 tests).
- Screenshot pass at 1440×900 completed for chat, settings, board, review,
  agents, brain, skills, history, hub, operations, projects, and mobile chat;
  no duplicated headings or detached disclosures remain.
- Remaining: explicit 900×700 pass, focus-order/a11y audit, reduced-motion
  confirmation.

## Non-negotiables
- No backend/API contract changes.
- Existing routes and keyboard commands keep working.
- No data loss in board/thread actions.
- Light theme still passes contrast (graphite has a light sibling).
