# barkcli — Architecture Analysis & Gaps vs Modern Agent Harnesses

**Date:** 2026-11-07
**Scope:** Current repo state vs. `ref/t3code`, `ref/deepseek-harness`, `ref/opencode`
**Author:** subagent analysis

---

## 1. Purpose & Scope

This document analyzes barkcli's current architecture and identifies gaps and improvement opportunities relative to modern agent harnesses (T3 Code, DeepSeek Harness, OpenCode). Focus areas: management-layer concept, worktrees/orchestration, threads, UI (`DESIGN.md`), providers, MCP, and CLI/server/TUI/web/desktop. It is an analysis only — no code changes.

barkcli's stated identity is **"the management layer for AI agents"** (intent → plan → worktree → gate → merge), not a task tracker. This analysis evaluates how well the implementation delivers that identity.

---

## 2. Current Architecture (as-is)

### 2.1 Crate / workspace layout

```
barkcli (Cargo workspace)
├── barkcli-core      # library: models, storage, commands, MCP, agent, memory, context, skills, mind, threads
├── barkcli-cli       # binary: pro commands, TUI/serve dispatch, listener, providers
├── barkcli-tui       # ratatui terminal board
├── barkcli-server    # axum browser server + WebSocket live reload
├── web               # React + Vite frontend (79 components)
├── desktop           # Tauri v2 shell over web/ (no feature fork)
└── vscode-extension  # Custom Editor for *.board
```

- **Language split:** Rust core + TS web. Single binary `barkcli` for CLI/server; Tauri for desktop.
- **Storage:** file-is-truth — `*.board` YAML + `.board/**/*.json` + JSONL logs. No DB.
- **Version:** 0.3.0-mvp shipped (`v0.3.0-mvp` tag); implementation log claims 86 tests passing.

### 2.2 Core domains (barkcli-core)

| Domain | Key files | State |
|---|---|---|
| Models | `models/{board,card,column,spec,context,session,sprint}.rs` | Solid; `Card.spec_id` added |
| Storage | `storage/{board_file,board_dir,context,history,sessions,specs,sprints}.rs` | Solid; locking hardened (G1) |
| Commands | `commands/*` (intake, plan, monitor, review, memory, mind, overview, skills, context, …) | Working MVP |
| Agent | `agent/{orchestrate,queue,identity,roles,capacity,decompose,autopilot,worktree,backend,session,liveness}.rs` | Substantial; backend trait + worktree |
| Memory | `memory/{store,search,tiers,ingest,embeddings}.rs` | 4 tiers, BM25+TF-IDF hybrid |
| Context | `code/{symbols,index,metrics,callgraph,tests}.rs` + `context/*` + `context_file/*` | Regex symbols, git-aware sync |
| Skills | `skills/{mod,registry,loader,discover,install,manage,publish,scanner}.rs` + builtins | Implemented |
| Mind | `mind/{snapshot,digest}.rs` + `commands/{mind,overview}.rs` | Implemented |
| Threads | `threads/mod.rs` | JSONL event log, classification, liveness-aware status |
| MCP | `mcp.rs` (~70 tools) | JSON-RPC 2.0 over stdio |
| AI | `ai/provider.rs` (OpenAI-compatible) | Offline-friendly provider resolution |
| Brain | `brain/{graph,relations}.rs` | Knowledge graph |
| Runtime | `runtime/*` (chat, provider, runner, store, trace, contribution, event) | Provider registry + run loop |
| Guard | `guard/*` (checks, deps, diff, security) | Trust layer |
| Receipt | `receipt/*` | Receipts / review queue |

### 2.3 Interfaces

- **CLI:** `barkcli-core/src/cli.rs` dispatcher + `barkcli-cli` binary (run, listener, serve, mcp, providers, …).
- **TUI:** `barkcli-tui` ratatui board; `app.rs` + components.
- **Server:** `barkcli-server` axum, ~250 routes, WebSocket live reload, token auth, file watcher, `ServeDir` fallback.
- **Web:** React + Vite, 79 components, hashnav; `App.tsx` 1161 LOC.
- **Desktop:** Tauri v2 shell over `web/`; sidecar `barkcli serve --app`; freshness verifier.
- **VS Code:** Custom Editor for `*.board`.
- **MCP:** `barkcli mcp` stdio server.

### 2.4 Data / storage layout

```
project/
├── *.board (YAML, committed)
└── .board/
    ├── config.json, tasks/, agents/, memory/, context/, specs/, sprints/
    ├── sessions/, history/, orchestration/, checkpoints/, undo/, locks/
    ├── skills/, mind/, threads/, worktrees/, receipts/, review/
    └── (gitignored except config + committed skills)
```

### 2.5 Strengths (do not regress)

1. **File-is-truth + offline-first** — CRUD, memory search, context scan, mind sync, overview work with no network.
2. **Management pipeline** — `intake → plan → dispatch → review → memory → mind` is a real, wired loop with heuristic LLM fallback.
3. **Worktree isolation** — `acquire_worktree`/`release_worktree` with slug sanitization, quota (8), auto-prune, shared build cache.
4. **Thread event log** — rich `ThreadEventKind` (28+ kinds), monotonic seq, liveness-aware status classification (running/stalled/settled).
5. **Provider detection** — 5 backends (opencode, claude-code, codex, fx, human) with auth/version/capability probing.
6. **MCP surface** — ~70 tools covering board/card/task/agent/memory/spec/sprint/context/mind/skills/autopilot/bundle/review/receipt.
7. **Mind snapshot** — compiled "what's happening" view with blockers, stale, next actions, velocity, digest.
8. **Design system** — `DESIGN.md` is a thorough, YC-inspired spec; recent graphite/T3 shell modernization.
9. **Desktop parity** — single UI for web + desktop via sidecar; freshness enforced.

---

## 3. Reference Harnesses Studied

### 3.1 T3 Code (t3code)

- **Identity:** "agent harness control surface" — controls agents on your machine via web/mobile/Electron desktop.
- **Providers:** Claude, Codex, Cursor, Grok Build, OpenCode, Antigravity, fx (more than barkcli).
- **Core patterns:** threads as first-class (fork, revert, history paging), checkpoints/rollback, checkpoint safety, PR sync reactors, usage-limit recovery, context handoff, delegated tasks, effect outbox, projection store, live streaming budgets, thread notifications, worktree setup tracking, worktree removal, checkpoint capture/restore.
- **UI:** React web with extensive state stores, command palette, branch toolbar, diff panels, persistent thread terminals, mobile app.
- **Architecture:** Effect-based (Effect TS), SQLite persistence, RPC over WebSocket, provider adapter registry.

### 3.2 DeepSeek Harness (dsh)

- **Identity:** all-plugin Cordis agent harness; everything is a plugin (model adapter, tool registry, session log, agent loop).
- **Core patterns:** append-only `SessionEvent` log, turn/step lifecycle, capability seams (service def/provider/consumer), subagents, agent teams, goals, compaction, spill, sandbox, schedule, deliverables, browser/computer use, ACP automation server, SDK (TS + Python), profile/bundle composition, HMR.
- **Architecture:** plugin tree composed from profiles/bundles/patches; typed events with declaration merging; session projections; migration chains for stored sessions.
- **UI:** Web app + Electron desktop + VitePress docs.

### 3.3 OpenCode (ref/opencode)

- **Identity:** open-source coding agent (TS/Bun) with TUI, web, desktop, SDK.
- **Core patterns:** agents, commands, skills, tools, permissions, MCP servers, providers, models, themes, sessions, server API.
- **Relevant:** barkcli already integrates OpenCode as a backend and borrows its skills/MCP concepts.

---

## 4. Gap Analysis by Focus Area

### 4.1 Management layer concept

| Capability | barkcli | Modern harnesses | Gap |
|---|---|---|---|
| Intent → structured work | `intake` (LLM + heuristic) + spec | Agent loops create tasks inline | Barkcli is stronger on structure; harnesses weaker on PM |
| Plan → tasks | `plan --tasks` + child cards + TaskQueue | Decomposition inside agent | Parity |
| Dispatch → execute | External agent subprocess in worktree | First-party agent loop with tools | Barkcli delegates; no first-party loop |
| Review gate | `review` heuristic + review queue | Human-on-the-loop, milestone gates | Parity-ish; barkcli gate is lighter |
| Memory / mind | 4-tier memory + MindSnapshot + digest | Session log + compaction + goals | Barkcli mind is unique; memory lacks dense embeddings (optional ONNX) |
| Spec traceability | `Spec` + `Requirement` + `card.spec_id` + coverage | Weak in harnesses | Barkcli stronger |
| Milestones / roadmap | **Not implemented** (planned in vision) | Vercel/Linear-style | **Gap: no milestone model** |
| Velocity / capacity | `VelocityTracker` exists but wiring incomplete | Usage limits, token budgets | Partial |
| Blocker/stale insights | Mind + monitor + autopilot | Mission Control health views | Parity on web; TUI lacks |

**Key gap:** barkcli has no first-party agent loop. It is purely a management shell over external CLIs. This is by design (agent is a role), but it means barkcli cannot run a task end-to-end without an installed external agent. Modern harnesses (dsh, opencode) ship their own loop with tool execution, sandbox, compaction. Opportunity: add an optional **embedded minimal agent runner** (human backend already writes prompt file; could add a "barkcli run --embedded" using the existing AI provider + tool primitives) for environments without external CLIs. Effort: high.

### 4.2 Worktrees & orchestration

| Capability | barkcli | Modern harnesses | Gap |
|---|---|---|---|
| Create isolated worktree | `acquire_worktree` | t3code worktree setup tracker | Parity |
| Quota + auto-prune | MAX_CONCURRENT_WORKTREES=8 | — | Barkcli has it |
| Shared build cache | `setup_shared_build_cache` | — | Barkcli has it |
| Release + branch delete | `release_worktree` | worktree removal service | Parity |
| Merge train | **Not implemented** (vision mentions) | t3code has merge/revert | **Gap** |
| Conflict resolution | None | t3code checkpoint/revert | **Gap** |
| Checkpoint / rollback | `checkpoint` command exists | t3code CheckpointCapture/Restore/Rollback | Partial — needs wiring to worktrees |
| PR sync | None | t3code PullRequestSyncReactor | **Gap** |
| Worktree setup tracking | None | t3code WorktreeSetupTracker | **Gap** (status of install/deps in new worktree) |
| Orchestration persistence | Fixed (G3) per vision log | dsh session log | Parity-ish |
| Context population on dispatch | Fixed (G4) | — | Parity |
| Task dependencies | `TaskQueue.next_pending` respects `dependencies` | dsh goals/subagents | Partial — card-level BlockedBy not in scheduler |
| Capacity wiring | `VelocityTracker` disconnected | usage limits | **Gap** |
| Parallel pool (`--agents N`) | `barkcli run --agents N` | t3code multi-thread | Claimed; verify end-to-end |

**Key gaps:** merge train, conflict handling, checkpoint/rollback tied to worktrees, PR creation/sync, worktree setup tracking (e.g., `npm install` in new worktree), card-level dependency scheduling, capacity enforcement.

### 4.3 Threads

| Capability | barkcli | Modern harnesses | Gap |
|---|---|---|---|
| Thread event log | JSONL with 28+ kinds, monotonic seq | dsh append-only SessionEvent, t3code thread history paging | Barkcli lighter; no compaction/spill |
| Status classification | liveness-aware (running/stalled/settled/needs_you) | t3code thread notifications | Strong |
| Fork / revert | **None** | t3code ThreadForkService, revert | **Gap** |
| Streaming deltas | `AssistantDelta` kind exists | t3code live streaming budgets | Need wiring from subprocess stdout |
| Tool call rendering | `ToolCall` kind exists | dsh tool pipeline events | Need capture from agents |
| Diff / checkpoint events | kinds exist | t3code diff panels | Need data |
| History paging | Read all events | t3code threadHistoryPaging | **Gap** for large threads |
| Compaction / spill | None | dsh compaction/spill | **Gap** for long threads |
| Handoff between agents | `Handoff` kind + command | dsh context handoff service | Partial |
| Thread deletion | `delete_thread_file` (transcript only) | t3code ThreadDeletion | Parity-ish |

**Key gaps:** fork/revert, live streaming capture, history paging, compaction/spill, rich tool/diff data capture from external agents.

### 4.4 UI & DESIGN.md

`DESIGN.md` is a strong, YC-inspired spec (Linear/Notion/Retool/Vercel/Figma/Superhuman/Stripe). Recent commits modernize web (graphite theme, T3-style shell, thread UX). Remaining gaps:

| Area | barkcli | Modern harnesses | Gap |
|---|---|---|---|
| Information architecture | Mind home, 2-level nav ≤7 items (per DESIGN) | t3code sidebar threads, dsh web | Partially implemented; `App.tsx` still 1161 LOC monolith |
| Command palette | `CommandPalette` exists; DESIGN wants nav+ops+sync mind | t3code command palette | Needs expansion |
| Card drawer vs modal | Modal today; DESIGN deferred drawer | t3code side inspector | **Gap** (drawer deferred) |
| Mobile | None | t3code mobile app | **Gap** (no responsive/mobile) |
| Real-time presence | WS reload; no who-changed | Figma-style presence | **Gap** |
| Mind route | Implemented | — | Parity |
| Agents view | OrchestrateView | t3code deployments metaphor | Partial |
| Knowledge (Memory/Skills/Docs) | Views exist | — | Parity |
| Accessibility | a11y toast live region | WCAG targets | Needs audit (focus rings, keyboard) |
| Performance | 250ms debounce | Vercel FMP budget | Needs measurement |
| TUI | Board only; DESIGN wants Orchestrate+Mind tabs | — | **Gap** (not added) |
| VS Code | Custom Editor only | — | Status bar + commands deferred |
| Emoji purge / icon system | Done (Icon.tsx ~30 SVGs) | — | Parity |

**Key gaps:** monolithic App.tsx, no mobile, no drawer, no presence, TUI missing tabs, VS Code status bar, accessibility audit.

### 4.5 Providers

| Capability | barkcli | Modern harnesses | Gap |
|---|---|---|---|
| Backend trait | `Backend` trait (opencode/claude/codex/fx/human) | t3code provider adapter registry | Barkcli has trait; t3code has richer registry |
| Detection | `which` + version + auth probes | t3code installation/auth services | Parity-ish |
| Capability flags | headless/stream/resume/fork/skills | t3code capabilities probes | Parity |
| Model catalogs | Env vars only | t3code ClaudeModelCatalog/CodexModelCatalog | **Gap** (no model listing/picker) |
| Auth flows | Probe only | t3code CodexChatGptAuth, Antigravity sign-in | **Gap** (no guided auth) |
| Usage limits / credits | None | t3code usage limits ingestion, reset credits | **Gap** |
| Provider instances | Single global | t3code ProviderInstanceRegistry | **Gap** (multi-instance) |
| Project settings override | None | t3code ProjectSettingsOverrideSweep | **Gap** |
| MCP elicitation | None | t3code CodexMcpElicitation | **Gap** |
| Streaming output | Subprocess stdout to transcript file | t3code live stream budgets | Partial |
| Provider count | 5 | t3code 7+ | Minor (add Cursor, Grok, Antigravity) |

**Key gaps:** model catalogs/picker, guided auth, usage limits, multi-instance providers, project overrides, MCP elicitation, more providers.

### 4.6 MCP

| Capability | barkcli | Modern harnesses | Gap |
|---|---|---|---|
| Protocol | stdio JSON-RPC 2.0 | t3code RPC over WS; dsh ACP | Barkcli standard MCP (good) |
| Tool count | ~70 | — | Strong |
| Tool coverage | board/card/task/agent/memory/spec/sprint/context/mind/skills/autopilot/bundle/review/receipt | — | Strong |
| Resources / prompts | **None** (tools only) | MCP resources/prompts spec | **Gap** (expose board files, mind digest as resources) |
| Streaming notifications | None | — | **Gap** (progress notifications) |
| Worktree tools | None | — | **Gap** (acquire/release/list worktrees via MCP) |
| Thread event tools | None | — | **Gap** (append/read thread events via MCP) |
| Provider status tool | None | — | **Gap** |
| Run live tool | None (server has `/api/run/live`) | — | **Gap** |
| Auth | Token via server; MCP no auth | — | Acceptable for local |

**Key gaps:** MCP resources/prompts, streaming progress, worktree/thread/provider/run-live tools.

### 4.7 CLI / server / TUI / web / desktop

| Interface | State | Gap vs modern |
|---|---|---|
| CLI | Rich command matrix; `barkcli run` autonomy loop | Good; needs `milestone`, `worktree` subcommands, `thread` subcommands, better help grouping |
| Server | axum, ~250 routes, WS reload, token auth | No SSE streaming, no multi-project switching API, no remote pairing, no granular permissions |
| TUI | ratatui board only | Missing Orchestrate/Mind tabs per DESIGN; no streaming logs |
| Web | 79 components, modernized shell | Monolithic App.tsx; no mobile; no drawer; no presence |
| Desktop | Tauri shell, freshness enforced | Good; no auto-update, no native notifications, no deep links |
| VS Code | Custom Editor | Status bar, command palette, intake/overview commands deferred |

---

## 5. Cross-Cutting Gaps

1. **No first-party agent loop** — barkcli depends on external CLIs; cannot run tasks in pure-offline/CI environments without them.
2. **Milestone/roadmap model missing** — planned but not implemented; limits planning horizon.
3. **Worktree lifecycle incomplete** — no merge train, conflict handling, checkpoint/rollback integration, PR sync, setup tracking.
4. **Thread richness incomplete** — no fork/revert, paging, compaction/spill, live streaming capture.
5. **Provider depth shallow** — no model catalogs, guided auth, usage limits, multi-instance, overrides.
6. **MCP surface incomplete** — no resources/prompts, worktree/thread/provider/run-live tools, progress notifications.
7. **UI monolith + no mobile** — `App.tsx` 1161 LOC; no responsive/mobile; no drawer; no presence.
8. **TUI/VS Code behind spec** — TUI missing tabs; VS Code missing status bar/commands.
9. **Concurrency/locking** — hardened for board file; verify all L2 writers (queue, specs, memory, context) use atomic tmp→rename + lock.
10. **Observability** — no structured tracing/metrics endpoint; server logs only; no run telemetry.
11. **Testing** — 86 tests claimed; need stress tests for threads/worktrees/providers; e2e for full pipeline.
12. **Extensibility** — skills exist; no plugin runtime (by design); but no WASM/hook escape hatch beyond skills.

---

## 6. Prioritized Improvement Opportunities

### P0 (high impact, low-medium effort) — do first

1. **Implement milestone/roadmap model** (`models/milestone.rs`, `storage/milestones.rs`, CLI `milestone`, web Roadmap view, MCP tools). Closes a documented vision gap.
2. **Add TUI Orchestrate + Mind tabs** per DESIGN.md §15.2 (reuse monitor/mind rendering).
3. **Expand MCP surface** with resources (board, mind digest), worktree tools (acquire/release/list), thread tools (append/read), provider_status, run_live. Low effort, high leverage for agents.
4. **Wire VelocityTracker + capacity** into orchestration cycle; populate card-level BlockedBy into scheduler.
5. **Add worktree setup tracking** (run `npm install`/`cargo build` in new worktree, record status) — small service, big UX.
6. **Refactor `App.tsx`** into route-level modules + keep hashnav; reduce monolith. Improves maintainability.

### P1 (high impact, medium effort)

7. **Live thread streaming capture** — pipe subprocess stdout into `ThreadEvent::AssistantDelta`/`ToolCall`/`FileChange` in real time; add history paging + compaction.
8. **Thread fork/revert** — implement `ThreadForkService`-equivalent; tie to git checkpoint/rollback.
9. **Provider depth** — add model catalogs (opencode/claude/codex), guided auth commands, usage-limit probing, multi-instance registry, project overrides.
10. **Checkpoint/rollback integration** with worktrees — `checkpoint save` in worktree, `restore` to main.
11. **Merge train** — after gate passes, rebase/merge branch into main with conflict detection + retry; `merge` command exists, needs automation.
12. **PR sync** — create PR from worktree branch, watch status, link to card.
13. **Mobile/responsive web** — at least tablet; t3code mobile is a separate app (out of scope for v1, but responsive CSS needed).
14. **Card drawer** (right inspector) instead of modal — per DESIGN.md deferred.

### P2 (strategic, high effort)

15. **Embedded minimal agent runner** — use `ai/provider.rs` + tool primitives to run a task without external CLI; enables pure-offline/CI.
16. **Desktop auto-update + native notifications + deep links.**
17. **Remote pairing / multi-machine** — t3code-style remote control; barkcli is local-first by design, so optional.
18. **Plugin runtime (WASM)** — deferred in vision; reconsider only if demand proven.
19. **Dense embeddings (ONNX)** — optional feature flag for semantic memory.
20. **Observability** — tracing spans, `/api/metrics`, run telemetry.

---

## 7. Recommended Roadmap (next 6 weeks)

- **Week 1 (P0.1–P0.4):** Milestones, TUI tabs, MCP expansion, velocity/capacity wiring. Ship v0.3.1.
- **Week 2 (P0.5–P0.6):** Worktree setup tracking, App.tsx refactor. Ship v0.3.2.
- **Week 3 (P1.7–P1.8):** Thread streaming + paging + fork/revert. Ship v0.3.3.
- **Week 4 (P1.9–P1.10):** Provider depth + checkpoint/rollback. Ship v0.3.4.
- **Week 5 (P1.11–P1.12):** Merge train + PR sync. Ship v0.3.5.
- **Week 6 (P1.13–P1.14 + polish):** Mobile/responsive + card drawer + accessibility audit. Ship v0.4.0.

Strategic items (P2) tracked separately; tackle after v0.4.0 based on user demand.

---

## 8. Appendix — Evidence Paths

- Core library: `barkcli-core/src/{models,storage,commands,agent,memory,context,skills,mind,threads,mcp,ai,brain,runtime,guard,receipt}.rs`
- CLI binary: `barkcli-cli/src/` (listener, providers, run)
- TUI: `barkcli-tui/src/{app,ui,handlers}.rs`
- Server: `barkcli-server/src/lib.rs`
- Web: `web/src/App.tsx`, `web/src/components/*`, `web/src/lib/*`
- Desktop: `desktop/src/main.rs`, `desktop/README.md`
- Design spec: `DESIGN.md`, `web/REDESIGN_T3.md`
- Vision: `MANAGEMENT_LAYER_VISION.md`, `MANAGEMENT_LAYER_PLAN.md`
- Upgrade plan: `UPGRADE_PLAN.md`
- Reference harnesses: `ref/t3code`, `ref/deepseek-harness`, `ref/opencode`
- Worktree module: `barkcli-core/src/agent/worktree.rs`
- Backend trait: `barkcli-core/src/agent/backend.rs`
- Threads: `barkcli-core/src/threads/mod.rs`
- Providers: `barkcli-core/src/commands/providers.rs`, `barkcli-core/src/runtime/providers.rs`
- MCP: `barkcli-core/src/mcp.rs`

---

*End of analysis.*
