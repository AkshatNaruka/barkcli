# barkcli Web Service — Implementation Plan

> **Goal:** Transform `barkcli serve` into a full-featured web application that provides complete feature parity with the CLI, real-time updates, and a seamless auto-hosted experience.

---

## Current State

**What exists:**
- `barkcli serve` starts an Axum server serving a React SPA from `web/dist/`
- WebSocket for board-level reload notifications
- API endpoints for: boards, cards, sprints, history, sessions, context, code search, tasks, agents, orchestration
- Web UI with: Dashboard, Board (kanban/list/table), Calendar, Reports, Code, Activity, Sprints, Settings, AI Agent prompt

**What's missing (12 features):**
1. Memory management (add/search/list/stats/facts)
2. Specs & requirements management
3. LLM-powered Intake (natural language → card)
4. LLM-powered Plan (card → child decomposition)
5. Review (validate completed cards)
6. Checkpoints (save/list/restore snapshots)
7. Undo/Diff/Blame
8. Import/Export
9. Validate/Doctor
10. Orchestration dashboard (API exists, no UI)
11. Agent management dashboard (API exists, no UI)
12. Real-time granular updates (currently only full board reload)

---

## Phase 1: Server API Layer (barkcli-server)

### 1.1 Memory API
```
GET    /api/memory?name=&q=&tier=&limit=
POST   /api/memory          { text, tier, tags, source }
GET    /api/memory/stats
POST   /api/memory/fact     { text, source }
GET    /api/memory/facts
DELETE /api/memory/:id
```
Implementation: Wrap `barkcli_core::memory::MemoryStore` operations. Load store from `.board/memory/<board>.json` on each request (or cache with invalidation).

### 1.2 Specs API
```
GET    /api/specs?name=
POST   /api/specs           { title, description, priority, requirements[], tags }
GET    /api/specs/:id
PUT    /api/specs/:id       { status, priority, ... }
DELETE /api/specs/:id
POST   /api/specs/:id/requirements  { title, description, acceptance_criteria }
PUT    /api/specs/:id/requirements/:req_id  { status }
GET    /api/specs/:id/trace
GET    /api/specs/:id/coverage
POST   /api/specs/scan-stale
```
Implementation: Wrap `barkcli_core::storage::specs` CRUD + `barkcli_core::commands::spec` logic.

### 1.3 Intake API
```
POST   /api/intake          { text, bug?, feature?, board? }
```
Implementation: Call `barkcli_core::commands::intake::run_intake()` which uses LLM to classify input, create card + optional spec. Returns created card.

### 1.4 Plan API
```
POST   /api/plan            { card_id, auto?, tasks? }
```
Implementation: Call planning logic from `barkcli_core::commands::plan`.

### 1.5 Review API
```
POST   /api/review          { card_id?, all?, auto? }
```
Implementation: Call `barkcli_core::commands::review::run_review()`.

### 1.6 Checkpoint API
```
GET    /api/checkpoints?name=
POST   /api/checkpoints     { label? }
GET    /api/checkpoints/:id
POST   /api/checkpoints/:id/restore
```
Implementation: Wrap `barkcli_core::commands::checkpoint` operations.

### 1.7 Undo/Diff/Blame API
```
POST   /api/undo
GET    /api/diff
GET    /api/blame/:card_id
POST   /api/snapshot        { label }
```
Implementation: Wrap `barkcli_core::commands::undo` operations.

### 1.8 Import/Export API
```
GET    /api/export?name=&format=json|yaml
POST   /api/import          { yaml|json, name? }
```
Implementation: Use existing `board_file::read_board` / `write_board` with format conversion.

### 1.9 Validate/Doctor API
```
GET    /api/validate?name=
POST   /api/doctor?name=
```
Implementation: Wrap `barkcli_core::commands::validate` and `doctor`.

### 1.10 Board Creation API
```
POST   /api/boards          { title, description?, columns? }
DELETE /api/boards/:name
```
Implementation: Create new `.board` YAML file + optional `.board/` init.

### 1.11 Enhanced Session API
```
GET    /api/sessions/:id
POST   /api/sessions        { agent, model, prompt, summary, commit_sha, files_touched }
POST   /api/sessions/:id/resume
```

### 1.12 Card Comment API
```
POST   /api/board/cards/:card_id/comments   { author, text }
DELETE /api/board/cards/:card_id/comments/:index
```

### 1.13 Context Enhancement
```
POST   /api/context/scan?name=          (full symbol scan)
POST   /api/context/link?name=          { card_id, path|symbol }
GET    /api/context/status?name=
GET    /api/context/show/:card_id?name=
```

---

## Phase 2: WebSocket Granular Events

Replace the single `reload` broadcast with typed events:

```rust
enum WsEvent {
    BoardReload { version: u64 },           // full reload (existing)
    CardCreated { card: Card },
    CardUpdated { card: Card },
    CardMoved { id: String, from: String, to: String },
    CardDeleted { id: String },
    SprintStarted { sprint: Sprint },
    SprintEnded { sprint: String },
    TaskCreated { task: TaskRequest },
    TaskUpdated { task: TaskRequest },
    AgentUpdated { agent: AgentIdentity },
    OrchestrationCycle { result: String },
    MemoryUpdated {},
    SpecUpdated { spec_id: String },
}
```

Frontend subscribes and applies granular state patches instead of full reloads.

---

## Phase 3: Web Frontend Components

### 3.1 New Navigation Tab: "Memory"
- **MemoryView.tsx** — Search, list, add, delete memories
- Tier filter (working/short-term/long-term/external)
- BM25 search with results highlighting
- Add memory form (text, tier, tags)
- Stats display (total, by tier, recent)

### 3.2 New Navigation Tab: "Specs"
- **SpecsView.tsx** — Full spec management
- Spec list with status badges (Draft/InProgress/Implemented/Verified/Deprecated)
- Spec detail panel with requirements list
- Create/update spec form
- Add requirement form with acceptance criteria
- Traceability view (spec → tasks → code)
- Coverage report (linked code vs total)
- Scan stale button

### 3.3 Enhanced "Board" Tab: Quick Actions
- **IntakeBar** — Prominent text input at top of Board view. Type natural language → AI creates card
- **PlanButton** — On any card, "Plan" button triggers decomposition into child cards
- **ReviewButton** — On done-column cards, "Review" validates acceptance criteria
- **DoneButton** — Quick move-to-done without manual drag

### 3.4 New Navigation Tab: "Timeline"
- **TimelineView.tsx** — Unified view combining:
  - Undo log with restore buttons
  - Diff viewer (current vs previous state)
  - Blame per card (who changed what when)
  - Checkpoints list with restore
  - Named snapshots

### 3.5 Enhanced "Settings" Tab
- Import/Export section (file upload/download)
- Validate/Doctor buttons with results display
- Board creation section
- AI config editor (not just read-only)

### 3.6 New "Orchestrate" Tab (replaces static "AI Agent")
- **OrchestrateView.tsx** — Live orchestration dashboard
  - Agent list with status indicators (Idle/Working/Paused/Error)
  - Register new agent form
  - Task queue with status filters
  - "Run Cycle" button
  - Orchestration state display
  - Next task display
  - Real-time agent heartbeat indicators

### 3.7 Enhanced CardForm
- Comments section (add/view/delete comments)
- Link visualization (mini tree/graph)
- Checklist with progress bar
- Due date with overdue warning
- Effort/story points
- Area selector

### 3.8 Tree View (new view mode in BoardPage)
- **TreeView.tsx** — Parent→child hierarchy visualization
- Collapsible nodes
- Drag to reparent

---

## Phase 4: Performance & UX

### 4.1 Optimistic Updates
- Card moves/edits apply locally before server confirms
- Visual indicator for pending changes
- Auto-revert on server error

### 4.2 Debounced Saves (already exists)
- 250ms debounce on board saves
- Skip self-triggered WS reloads

### 4.3 Skeleton Loading
- Already exists for initial load
- Add per-section skeletons for new views

### 4.4 Keyboard Shortcuts
- `Cmd+K` — Command palette (exists)
- `N` — New card
- `E` — Edit selected card
- `Del` — Delete selected card
- `M` — Move card (show column picker)
- `Cmd+Z` — Undo
- `Cmd+Shift+E` — Export
- `?` — Help modal with all shortcuts

### 4.5 Command Palette Enhancement
Add all new commands to CommandPalette:
- `memory add <text>` / `memory search <query>`
- `spec create <title>` / `spec list`
- `intake <text>` — natural language card creation
- `plan <card-id>` — decompose card
- `review [card-id]` — validate completion
- `checkpoint save` / `checkpoint list`
- `undo` / `diff` / `blame <card-id>`
- `validate` / `doctor`
- `import` / `export`
- `orchestrate cycle` / `orchestrate status`
- `agent list` / `agent register`

### 4.6 Toast Notifications
- Already exists
- Enhance with action buttons (e.g., "Undo" button on card delete toast)

### 4.7 Mobile Responsive
- Already partially responsive
- Ensure new views work on mobile
- Bottom nav bar on small screens

---

## Phase 5: Auto-Start Service

### 5.1 Enhanced `barkcli serve`
```bash
barkcli serve                    # Start with auto-detect board
barkcli serve --port 8080        # Custom port
barkcli serve --host 0.0.0.0     # Network accessible
barkcli serve --token secret     # Require auth
barkcli serve --open             # Auto-open browser
barkcli serve --dev              # Dev mode with HMR (vite proxy)
```

### 5.2 Auto-Init
If `.board/` doesn't exist when `serve` starts:
1. Automatically run `barkcli init`
2. Create a default board if none exist
3. Show first-run wizard in web UI

### 5.3 Background Service
```bash
barkcli serve --daemon           # Run in background
barkcli serve --stop             # Stop background service
barkcli serve --status           # Check if running
```
Implementation: Fork process, write PID to `.board/server.pid`, manage via signal.

### 5.4 File Watcher Enhancement
- Watch ALL `.board` files, not just the active one
- Watch `.board/` directory for config/specs/memory changes
- Broadcast granular WS events for each change type

---

## Implementation Order

### Sprint 1: Foundation (Days 1-3)
1. Add all missing server API endpoints (Phase 1)
2. Implement WebSocket granular events (Phase 2)
3. Board creation + Import/Export API

### Sprint 2: Core Views (Days 4-7)
4. MemoryView component + integration
5. SpecsView component + integration
6. OrchestrateView (agent + task management)
7. Enhanced CommandPalette with all commands

### Sprint 3: AI Features (Days 8-10)
8. IntakeBar (natural language → card)
9. PlanButton (card decomposition)
10. ReviewButton (completion validation)

### Sprint 4: Polish (Days 11-14)
11. TimelineView (undo/diff/blame/checkpoints)
12. TreeView (parent→child hierarchy)
13. Enhanced CardForm (comments, links visualization)
14. Keyboard shortcuts + help modal
15. Optimistic updates + performance tuning
16. Auto-init + daemon mode

---

## File Changes Summary

### New Files (web/src/components/)
- `MemoryView.tsx`
- `SpecsView.tsx`
- `SpecDetail.tsx`
- `OrchestrateView.tsx`
- `TimelineView.tsx`
- `TreeView.tsx`
- `IntakeBar.tsx`
- `ReviewButton.tsx`
- `PlanButton.tsx`
- `ImportExport.tsx`
- `ValidateDoctor.tsx`
- `AgentManager.tsx`
- `TaskQueue.tsx`
- `ShortcutHelp.tsx`

### Modified Files
- `barkcli-server/src/lib.rs` — Add ~15 new route handlers
- `web/src/App.tsx` — Add new nav items, integrate new views
- `web/src/lib/api.ts` — Add API functions for all new endpoints
- `web/src/lib/types.ts` — Add new types (Spec, Memory, etc.)
- `web/src/components/CommandPalette.tsx` — Add all new commands
- `web/src/components/CardForm.tsx` — Add comments, enhanced links
- `web/src/components/SettingsView.tsx` — Add import/export/validate
- `web/src/components/BoardView.tsx` — Add quick actions bar
- `web/src/components/Dashboard.tsx` — Add orchestration summary

### New Files (barkcli-server/)
- `src/handlers/memory.rs` — Memory API handlers
- `src/handlers/specs.rs` — Specs API handlers
- `src/handlers/intake.rs` — Intake API handler
- `src/handlers/plan.rs` — Plan API handler
- `src/handlers/review.rs` — Review API handler
- `src/handlers/checkpoint.rs` — Checkpoint API handlers
- `src/handlers/undo.rs` — Undo/diff/blame handlers
- `src/handlers/import_export.rs` — Import/export handlers
- `src/handlers/validate.rs` — Validate/doctor handlers
- `src/ws_events.rs` — Granular WebSocket event types
