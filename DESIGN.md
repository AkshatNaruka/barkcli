# barkcli Design System — Management Layer (YC-inspired)

> **Status:** active · **Branch:** `feat/web-mgmt-layer` · **Scope:** `web/` only (no core/storage/API changes)
> **Thesis:** barkcli is not a CLI tool with a web viewer. It is the **management layer between humans and coding agents** — and the web app is its primary control plane. The CLI is the power-user edge.

---

## 1. Vision: From CLI Tool → Management Layer

Today the web app mirrors the CLI: 15 equal tabs, tables, monospace badges. A PM opening `barkcli serve` cannot answer *"what's blocked, what's next, who's working on what"* in 15 seconds.

Target: open `barkcli serve` → **Mind** answers health / blockers / next action immediately → **Board** shows work with spec traceability → **Agents** shows queue like deployments → **Knowledge** holds memory/skills/docs. CLI commands (`intake`, `plan`, `dispatch`, `review`) remain, but the web app is where humans *manage*.

```
Human ──▶ Mind (what's happening?) ──▶ Board (what's the work?) ──▶ Agents (who's doing it?)
  ▲                                        │ spec_id                         │ queue/review gate
  └────────── Knowledge (memory/skills/docs) ◀── Code (context) ─────────────┘
```

---

## 2. Research: YC Startup Tear-downs

Method: public product/blog/docs studied Sep 2026. One line per startup: what we steal, what we avoid.

### Linear (YC W20) — the gold standard for issue management

- **Source:** [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) — sidebar/tabs/headers/panels reworked to *reduce visual noise, maintain alignment, increase hierarchy and density*; theme generator for light/dark; shipped in 5 milestones (stress tests → behavior definitions → chrome refresh).
- **Steal:** keyboard-first + `⌘K` as primary navigation; label/icon/button alignment (felt, not seen); density with hierarchy; board ↔ list as *view modes*, not separate pages; custom themes.
- **Avoid:** Linear has no agent layer — we add Agents + Mind on top of the same chrome.
- **Token note:** Inter Variable with `font-feature-settings: "cv01","ss03"`; letter-spacing scales with size (−0.24px @20px → normal <16px); semi-transparent white borders `rgba(255,255,255,0.05–0.08)`; multi-layer dialog shadows.

### Notion (YC-adjacent, SoMa) — knowledge as database

- **Source:** Data Sources update (2025) — databases become reusable *single source of truth* across views; sidebar is the skeleton (7 top-level items max in mature setups); slash commands; doc ↔ task linking.
- **Steal:** sidebar skeleton ≤7 primary items; one underlying object (Card) shown as board/table/list views; slash-command creation mental model → our `⌘K` "new card".
- **Avoid:** Notion's everything-is-a-page flattens hierarchy; we keep Manage/Build/Knowledge separated.

### Retool (YC W17) — the management-layer layout

- **Source:** [Classic app IDE docs](https://docs.retool.com/apps/concepts/ide) — **left panel (resources) / canvas (work) / right inspector (detail)**, navbar with command palette, status bar; intentional left→right flow.
- **Steal:** the exact 3-pane grammar for Board (sidebar nav / kanban canvas / card drawer inspector) and Agents (queue / run detail). This is the strongest structural precedent for a "management layer".
- **Avoid:** builder-only complexity; our inspector is read-mostly.

### Vercel (YC W15) — deployments as the metaphor for agent runs

- **Source:** [Dashboard redesign](https://vercel.com/blog/dashboard-redesign) — project overview surfaces *production + preview deployments*; deployment inspector merges logs + git commit/author/branch; tab icon reflects status; SWR realtime; FMP −1.2s via memoization/batching.
- **Steal:** production-vs-preview duality → done-vs-active work; per-run inspector (logs + commit + author); status in favicon/tab; SWR-style realtime over our WS reload; performance budget (our card move already debounced 250ms).
- **Avoid:** marketing-site chrome inside the app.

### Figma (YC W12) — multiplayer canvas

- **Source:** sidebar-anchored layout (Notion/Figma/Slack pattern); multiplayer cursors as presence.
- **Steal:** board as shared canvas; agents as collaborator avatars (heartbeat → presence dot); WS live reload already exists — surface *who* changed what.

### Superhuman (YC W18) — speed as a feature

- **Source:** `Cmd+K` for *every* action; split inbox ≤7 sections; inbox-zero workflow; 3-column layout (48px toolbar / 360px list / fluid pane); keyboard shortcuts for all.
- **Steal:** `⌘K` does everything (nav + card ops); ≤7 primary nav items; triage workflow for review gate (`review --all`); split Board by column like split inbox.

### Stripe Dashboard (YC S09) — dense yet calm

- **Steal:** stat cards + sparse tables + search-first; numbers with muted labels; nothing shouts.
- **Avoid:** finance-specific density; we show 4–6 metrics max per panel.

### AI agent orchestrators (2026, AugmentCode roundup) — direct validation

- **Source:** [9 Open-Source Agent Orchestrators](https://www.augmentcode.com/tools/open-source-agent-orchestrators) — winning pattern is **desktop app: projects left / sessions center / inspector right** (Agent Orchestrator); **milestone gates, human-on-the-loop** beats per-edit approval; **Janitor/verify step** before merge (Bernstein: Goal → Planner → Task Graph → Orchestrator → Janitor → merge); **Mission Control** health view (Forge); shared board + preview browser (Vibe Kanban).
- **Steal:** *everything about Agents view*: queue center, run inspector right, review gate explicit, milestone-gate language ("Run cycle" → dispatch; verify before done). This is the industry converging on our `dispatch → review` pipeline — the web app must show it, not hide it in CLI.

### Sidebar UX (2026 guide)

- **Source:** sidebar best practices — 3-level hierarchy (primary 15–16px ≤7 items / secondary 13–14px / utility bottom), 220–260px width, icons supplement labels, search+notifications in top bar, independent scroll, **structure first, styling second**.

---

## 3. Principles

1. **Mind is the homepage.** `#/` → Mind. Dashboard merges into it.
2. **Two-level nav, ≤7 primary items.** Sidebar sections, not 15 tabs.
3. **Board is not a silo.** Every card shows spec, blocker, staleness inline.
4. **Traceability is first-class.** `spec_id` badge → spec preview; card detail has Spec tab.
5. **Agents are peers.** Agents view = Vercel deployments: queue + run inspector + review gate.
6. **Speed = Linear.** Optimistic updates, skeletons, `⌘K` for everything, 300ms feel.

---

## 4. Tokens

Keep existing CSS vars (`--bg/surface/card/border/text/muted/accent/success/warning/danger`) — they already match the Linear dark recipe (near-black `#000/#111/#161`, white-at-5–8% borders). Changes:

- **Typography:** add `font-feature-settings: "cv01","ss03"` on Inter (Linear non-negotiable); letter-spacing −0.01em on 15px+ headings, normal below; mono stays JetBrains Mono for IDs/hashes.
- **Elevation:** command palette + drawers use multi-layer dialog shadow (replace single `--shadow` for `.palette` / `.drawer` classes only).
- **Focus:** visible `focus-visible` ring `2px accent-soft` on all interactive elements (keyboard-first means focus must be seen).
- **Selection:** `accent-soft` background.
- **Radius:** 8px cards, 12px dialogs, 9999px pills (badges) — already true; codify, don't change.
- **Sidebar:** 232px, collapsible to 56px icon rail; independent scroll; utility pinned bottom.

---

## 5. Information Architecture

```
Sidebar (232px, collapsible)          TopBar (single row)                Canvas
─────────────────────────────          ─────────────────                 ──────
barkcli mark + board switcher          ⌘K search · git · theme           Mind (default)
MANAGE
  Mind (home)                            ← replaces Dashboard
  Board (board/table/list modes)
  Specs · Sprints
BUILD
  Code
  Agents (alias: orchestrate)
KNOWLEDGE
  Memory · Skills · Docs
INSIGHTS
  Calendar · Reports · Timeline · Activity
─────────────
Settings · AI Agent
```

- Old hashes keep working (`dashboard` renders Mind; `orchestrate` renders Agents).
- Badges: Board (open count), Agents (active runs), Mind (blocker count, red when >0).
- TopBar: `⌘K` centered search button, board switcher left, git branch + theme right. No tab bar.

---

## 6. Layouts

### Mind (default `#/`)
Header: board name + generated-at + [Sync] [Copy digest]. Grid: Health + Sprint/Velocity → Blockers + Stale → Next Actions (clickable → Board/navigate) → Digest preview + Recent + Top Memories. Clicking a blocker/stale row opens the card in Board.

### Board
Filter bar (text + `is:blocked` toggle) above view switcher. Cards: spec badge `⎇`, red left-border when blocked, amber stale dot (>7d, not done). Card detail = right drawer (future) — today modal + new **Spec tab** (spec title/status/requirements + linked tasks).

### Agents (renamed Orchestrate)
Left: agent registry with presence dots. Center: task queue with status pills + filter. Right (inspector): selected run — card link, agent, status, files/commit when completed, [Claim] [Complete] actions. [Run cycle] primary button top. Milestone-gate copy: "Verify before done".

### Knowledge (Memory/Skills/Docs)
Unchanged this pass except sidebar grouping + `fetchSkills` reuse.

---

## 7. Components

- `Sidebar` (new): sections, badges, collapse, utility bottom.
- `TopBar` (new, extracted from App header): brand, board switcher, `⌘K`, git, theme.
- `KanbanCard`: `+ blocked` (red border + ⛔ reason), `+ stale` (amber dot), existing spec badge.
- `CardForm`: `+ Spec` tab (fetchSpec by `spec_id`, requirements list, trace link).
- `CommandPalette`: `+ go to <view>` nav commands, `+ sync mind`.
- `MindView`: clickable rows (blockers/stale → board; next actions → copy command).

---

## 8. Motion & Performance

- Keep 250ms debounced save; add optimistic card move (already local-first via `doSave`).
- Skeletons for Mind/Agents panels (existing pattern).
- Drag spring via existing dnd-kit; no new deps.
- No new npm dependencies this pass.

---

## 9. Implementation Plan (branch `feat/web-mgmt-layer`)

- [x] `index.css`: font-feature-settings, focus ring, selection, dialog shadow class.
- [x] `Sidebar.tsx` (new); `App.tsx`: sidebar layout, slim header, BoardPage filter. (TopBar kept inline in App — single slim header row.)
- [x] `hashnav.ts`: default `mind`; added `agents` alias; `dashboard` kept as alias rendering Mind.
- [x] `MindView`: clickable blocker/stale/next-action rows; `CardForm`: Spec tab via `fetchSpec`; `KanbanCard`: blocked red border + stale dot; `CommandPalette`: `go to <view>` + `sync mind`.
- [x] `npm run build` green (tsc + vite, 526 modules) + `barkcli serve` smoke (`/api/mind`, `/api/skills`, index).
- [x] Emoji purge + Jira/Azure polish: `Icon.tsx` (~30 inline SVGs, zero deps) + `Lozenge.tsx` status pills; Sidebar/KanbanCard/Column/PriorityBadge/palette/theme/form/Mind/Dashboard/Calendar/List/Orchestrate converted; bundle verified emoji-free (only intentional checkbox text glyphs); BoardPage quick-filter chips (Blocked/Stale/No spec/High).

Out of scope (deferred): card drawer (stays modal), milestones model, TUI, MCP/server changes.

---

## 10. Appendix — Sources

- Linear redesign: https://linear.app/now/how-we-redesigned-the-linear-ui
- Linear DESIGN tokens: open-design `design-systems/linear-app/DESIGN.md` mirrors
- Notion Data Sources 2025: https://www.notionapps.com/blog/notion-data-sources-update-2025
- Retool IDE: https://docs.retool.com/apps/concepts/ide
- Vercel dashboard redesign: https://vercel.com/blog/dashboard-redesign
- Superhuman split inbox: https://blog.superhuman.com/how-to-split-your-inbox-in-superhuman/
- Superhuman DESIGN tokens: imviren/Design.md `design-systems/saas/superhuman.DESIGN.md`
- Agent orchestrators 2026: https://www.augmentcode.com/tools/open-source-agent-orchestrators
- Sidebar UX 2026: alfdesigngroup sidebar navigation guide
