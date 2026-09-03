# barkcli — Management Layer Vision (V2)
## Git for Human ↔ AI Collaboration. Offline-first. Open Source (MIT).

> **One-line pitch:** `barkcli` is `.git` for project management — but the `.board/` directory is a **mind** that lives in your repo, not the cloud. Humans write intent, agents do work, `barkcli` is the management layer in between.

**Author:** deep codebase audit Sep 2026  
**Status:** RFC / implementation blueprint (replaces `MANAGEMENT_LAYER_PLAN.md` V1)  
**Principles:** offline-first · file-is-truth · git-native · human-in-the-loop · local LLM ready · MIT

---

## Table of Contents

1. [Why This Must Exist](#1-why)
2. [Current State Audit (Evidence-Based)](#2-audit)
3. [Vision: What "Best Possible" Means](#3-vision)
4. [Design Principles](#4-principles)
5. [Architecture: 7 Layers](#5-architecture)
6. [Data Layer: `.board` as Git](#6-data)
7. [Domain Model Evolution](#7-domain)
8. [Management Pipeline](#8-pipeline)
9. [Skill System](#9-skills)
10. [Agent Abstraction](#10-agents)
11. [Memory & Mind](#11-memory)
12. [Context Engine 2.0](#12-context)
13. [Orchestration & Delegation](#13-orchestration)
14. [Planning & Overview](#14-planning)
15. [Interfaces (CLI/TUI/Web/VSCode/MCP)](#15-interfaces)
16. [Offline AI Strategy](#16-offline)
17. [Git Integration](#17-git)
18. [Extensibility](#18-extensibility)
19. [Open Source Positioning](#19-oss)
20. [Roadmap: 6 Phases, 10 Weeks](#20-roadmap)
21. [File Impact Matrix](#21-files)
22. [Success Metrics](#22-metrics)
23. [Risks](#23-risks)
24. [Immediate Next Steps](#24-next)

---

## 1. Why This Must Exist <a id="1-why"></a>

**Problem today:** Humans paste vague prompts into coding agents. Agents have no memory, no task breakdown, no code context, no review gate. Work is invisible, unrepeatable, unmergeable.

**The gap:** Cloud PM tools (Linear/Jira) don't understand code, don't run offline, don't speak agent protocol, and lock data outside the repo.

**barkcli's bet:** The repo already *is* the source of truth. A `.board/` directory — like `.git/` — can store boards, specs, memory, sessions, context, and orchestration state as **plain YAML/JSON committed with code**. No accounts, no cloud, `cargo install barkcli` and you have a management layer that:

- turns natural language → structured cards + specs (`intake`)
- decomposes specs → agent-ready tasks with file context (`plan`)
- dispatches tasks to the *right* agent with full context (`dispatch`)
- tracks live progress (`monitor`) and validates output (`review`)
- remembers everything across sessions (`memory` + `mind`)
- syncs with git history (`context sync`)

This is not a CLI wrapper. It is the **operating system for human→AI delivery** inside the repo.

---

## 2. Current State Audit (Evidence-Based) <a id="2-audit"></a>

Audit date: 2026-09-03. Read every crate file listed in §21.

### 2.1 What Already Exists and Is Solid

| Component | File | Verdict | Notes |
|-----------|------|---------|-------|
| **Board model** | `barkcli-core/src/models/board.rs:1-30` | ✅ Solid | `Board { title, columns, cards }` YAML-serializable |
| **Card model** | `barkcli-core/src/models/card.rs:1-198` | ✅ Solid | `version`, `links`, `acceptance_criteria`, `effort`, `pinned`, `checklist`, `blocked_by` |
| **Spec + Requirement** | `barkcli-core/src/models/spec.rs:1-333` | ✅ Solid | `SpecStatus`, `RequirementStatus`, coverage(), traceability fields `linked_code/tests/tasks` |
| **Memory tiers+BM25+TF-IDF** | `barkcli-core/src/memory/store.rs:1-343`, `memory/search.rs:1-322`, `memory/tiers.rs:1-169` | ✅ Surprisingly complete | 4 tiers (Working/Short/Long/External), hybrid BM25+TF-IDF, tier promotion/eviction — all local, no vectors API needed |
| **MCP server (33 tools)** | `barkcli-core/src/mcp.rs:1-1905` | ✅ Most complete interface | `board_*`, `card_*`, `task_*`, `agent_*`, `context_*`, `sprint_*`, `orchestrate_*`, `memory_*` — correct JSON-RPC 2.0 |
| **HTTP server** | `barkcli-server/src/lib.rs:1-1461+` | ✅ Feature-rich | `/api/board`, `/api/tasks`, `/api/agents`, `/api/memory`, `/api/specs`, `/api/checkpoints`, `/api/validate`, WebSocket live reload, auth token, file watcher |
| **CLI dispatcher** | `barkcli-core/src/cli.rs:1-744` | ✅ Well-structured | `resolve_board`, `parse_board_flag`, legacy `barkcli <board> add` compat, full command matrix |
| **Intake** | `barkcli-core/src/commands/intake.rs:1-315` | ✅ Working MVP | LLM classification → card + spec `specs/<board>.json` via `create_spec_from_intake:226` |
| **Plan** | `barkcli-core/src/commands/plan.rs:1-480` | ✅ Working MVP | LLM → `PlanOutput {requirements, child_cards}` → parent/child links + optional `TaskQueue` creation |
| **Monitor** | `barkcli-core/src/commands/monitor.rs:1-335` | ✅ Good dashboard | Board overview, agent status, queue progress bars, stuck detection, insights |
| **Review** | `barkcli-core/src/commands/review.rs:1-251` | ✅ Good gate | Checks `TaskResults`, AC completion, commit SHA, `--auto` move to done |
| **Memory CLI** | `barkcli-core/src/commands/memory.rs:1-445` | ✅ Full | `add/search/list/stats/compress/clear/fact` |
| **Listener (real impl)** | `barkcli-cli/src/listener.rs:1-721` | ✅ Real work now | `process_task:179` claims→branch→invoke opencode/claude→test→commit→report; earlier V1 doc's "skeleton" claim is now stale |
| **Symbol index** | `barkcli-core/src/code/symbols.rs:1-198`, `barkcli-core/src/code/index.rs` | ✅ Good | Regex extractors for Rust/TS/JS/Py/Go, `tokens_of` camel/snake splitting |
| **AI provider** | `barkcli-core/src/ai/provider.rs:1-200` | ✅ Clean | OpenAI-compatible `chat`, `chat_json`, resolves `env → ~/.board/config → .board/config.json → defaults`, Ollama/LM Studio ready |

### 2.2 What Is Broken or Incomplete (Gaps vs Vision)

| # | Gap | File Evidence | Impact | Severity |
|---|-----|---------------|--------|----------|
| G1 | **File locking is advisory only; no atomic commit** | `barkcli-core/src/util/lock.rs`, `queue.rs:319,328` uses `with_lock` but `board_file.rs` write is not lock-guarded in all paths | Concurrent `barkcli add` + MCP `card_create` can corrupt `*.board` | High |
| G2 | **Board file concurrency vs tasks/agents JSON** | `board_dir.rs:7-45` creates subdirs but no single source locking strategy | Queue + registry + board can drift | High |
| G3 | **Orchestration engine doesn't persist queue** | `agent/orchestrate.rs:59-63` holds in-memory `task_queue`/`agent_registry` initialized empty in `new()`, `dispatch_task:257` pushes `Vec::new()` context | `orchestrate cycle` loses tasks on restart, never reads `.board/tasks/*.json` | High |
| G4 | **Context population is thin** | `agent/queue.rs:341-368` `populate_context_files` reads only `BoardContext.files`; `web/src/lib/api` and `mcp.rs:1412` call it but `context scan` must have run first or queue tasks have `context_files: []` | Agents get empty file context | Medium |
| G5 | **Spec ↔ Board ↔ Task link is manual** | `intake.rs:240-242` writes `specs/*.json`, `plan.rs:316` writes child cards + queue, but no canonical `spec_id` on Card | Can't answer "which spec does this card belong to?" without scanning | Medium |
| G6 | **No skill registry** | No `skills/` directory, no `Skill` model; `hooks.rs:1-342` only handles git hooks | "skills to tasks delegation" promised in vision has no implementation | Medium |
| G7 | **No unified overview/mind command** | `commands/status.rs`, `commands/list.rs` exist but no `barkcli overview` / `barkcli mind` / `barkcli digest` | Human has no single "what's happening" view | Medium |
| G8 | **Listener hard-codes agent invocation** | `listener.rs:461-493` `invoke_opencode` expects `opencode --prompt`, `invoke_claude_code` expects `claude --print` — flags may drift; no streaming, no tool-allow list | Brittle subprocess coupling | Medium |
| G9 | **Server `claim_task_handler:1127` uses GET query param for agent_id** | `Path(task_id)` + `Query<HashMap>` ; MCP `tool_task_claim:1431` uses proper JSON but server and CLI listener diverge | API inconsistency | Low |
| G10 | **No roadmap/milestone model** | Only `models/sprint.rs` (name/start/end) | Sprint is too small for planning horizon | Low |
| G11 | **Memory has no git/session auto-capture** | `memory/store.rs:107-112` requires explicit `add`; no hook feeding session logs → memory | Mind stays empty unless human remembers | Medium |
| G12 | **Web UI is monolithic** | `web/src/App.tsx:1-731` single file wires all views; `components/` has 15 views but no `OrchestrateView` live queue | Hard to extend | Low |

### 2.3 Summary Judgment

~70% of the management layer **already exists as real code**, not just design. The V1 `MANAGEMENT_LAYER_PLAN.md` is 60% implemented. Remaining work is **wiring + hardening + productizing**, not green-field invention. The biggest conceptual missing piece is the **Skill system** and a true **Mind / Overview** that fuses boards+sprints+memory+context+git into one narrative.

---

## 3. Vision: What "Best Possible" Means <a id="3-vision"></a>

> `git` won because it is **local, file-based, composable, and boringly reliable**. barkcli wins the same way — but for *work*, not just code.

**Best possible offline management layer =**

1. **A file format + CLI that is zero-friction** — `barkcli init` → `barkcli add "fix login"` → file appears, git diff shows it. No daemon required for basic CRUD.
2. **A mind that remembers** — every session, decision, file mapping, and fix is indexed locally (BM25+TF-IDF today, optional ONNX embeddings later) and answers `barkcli memory search "auth errors"` in <100ms offline.
3. **A pipeline that turns fuzz → structure → execution** — `intake → plan → dispatch → review` each has a CLI command, an MCP tool, and a web UI panel, but all mutate the same YAML/JSON files.
4. **Skills as reusable capabilities** — like git hooks + Claude skills: markdown files in `.board/skills/` that teach agents project conventions ("always use Result<T>", "run `cargo test` before commit").
5. **Agents as interchangeable workers** — OpenCode, Claude Code, Cursor, or a human all implement `claim → work → complete` against the same `TaskQueue`. barkcli doesn't care *who* codes, only that work is tracked.
6. **Overview as narrative** — `barkcli overview` / web Dashboard tells the story: velocity, blocked, stale, risk, next action — not just tables.
7. **100% offline-capable core** — CRUD, search, context scan, TF-IDF, board moves work without network. LLM features degrade gracefully to heuristics when `BARKCLI_API_KEY` absent.

---

## 4. Design Principles <a id="4-principles"></a>

| # | Principle | Implication |
|---|-----------|-------------|
| P1 | **File is truth** | `*.board` YAML + `.board/**/*.json` are the DB. Server/TUI/web are views. `git status` shows everything. |
| P2 | **Offline first** | Every feature must have a local fallback. Network is enhancement, not requirement. |
| P3 | **Boring storage** | YAML for human-edited, JSON for machine-written. No SQLite/BerkeleyDB unless user opts in. Keeps merge conflicts human-resolvable. |
| P4 | **Small core, many interfaces** | Core is `barkcli-core` library. CLI/TUI/server/VSCode/MCP are thin consumers of `barkcli-core`. |
| P5 | **Human in the loop** | No silent auto-moves. `plan --dry-run`, `intake --dry-run`, `review` exists so human approves before dispatch. |
| P6 | **Agent is a role, not a product** | `AgentRole::TechLead` etc. exist but an agent is any process that can `task_claim → task_complete`. |
| P7 | **Convention over config** | Defaults (`todo/doing/review/done`, `BARKCLI_API_BASE`) work; flags override. `barkcli init` creates guardrails (`.gitignore`). |
| P8 | **MIT forever** | No freemium gate on core. Pro features = optional self-hosted enhancements (analytics, cloud sync) if ever. |

---

## 5. Architecture: 7 Layers <a id="5-architecture"></a>

```
┌─────────────────────────────────────────────────────────────────┐
│  L7  INTERFACES  CLI  TUI  Web  VS Code  MCP  Hooks   (all call L6) │
├─────────────────────────────────────────────────────────────────┤
│  L6  COMMANDS    intake plan dispatch/monitor review memory overview │
│                 card context spec sprint session checkpoint      │
├─────────────────────────────────────────────────────────────────┤
│  L5  ORCHESTRATION  OrchestrationEngine  TaskQueue  AgentRegistry │
│                    VelocityTracker  Roles  Capacity  Decompose   │
├─────────────────────────────────────────────────────────────────┤
│  L4  INTELLIGENCE  MemoryStore (4 tiers)  SkillRegistry  Mind     │
│                   SymbolIndex+CallGraph+Metrics  Rules/Insights  │
├─────────────────────────────────────────────────────────────────┤
│  L3  DOMAIN MODELS  Board Card Column Spec Requirement              │
│                    TaskRequest FileContext Sprint Session          │
├─────────────────────────────────────────────────────────────────┤
│  L2  STORAGE  board_file  board_dir  history  sessions  specs     │
│              sprints  context  memory  queue  locks  snapshots    │
├─────────────────────────────────────────────────────────────────┤
│  L1  UTIL  slug  lock (fs2)  git  style  redact  display       │
└─────────────────────────────────────────────────────────────────┘

Cross-cutting: `ai/provider.rs` (OpenAI-compatible chat) used by L6 intake/plan
               `util/lock.rs` (advisory fs2) used by L2
```

**Dependency rule:** upper layers may depend on lower, never reverse. `barkcli-core` must build without `barkcli-cli`/`barkcli-server`.

---

## 6. Data Layer: `.board` as Git <a id="6-data"></a>

### 6.1 On-Disk Layout (target)

```
project/
├── .board/                         # gitignored except *.board (see init)
│   ├── config.json                 # { version, default_board, columns, labels, priorities, ai }
│   ├── .gitignore                  # ignores history/ sessions/ context/ locks/ snapshots/ memory/tmp
│   ├── tasks/
│   │   ├── my-project.json         # TaskQueue { tasks: TaskRequest[] }
│   │   └── my-project_results.json # TaskResults
│   ├── agents/
│   │   └── registry.json           # AgentRegistry
│   ├── memory/
│   │   └── my-project.json         # Memory { entries[], project_facts[] }
│   ├── context/
│   │   └── my-project.json         # BoardContext { cards:{}, index:{} }
│   ├── specs/
│   │   └── my-project.json         # Spec[]
│   ├── sprints/
│   │   └── my-project.json         # Sprint[]
│   ├── sessions/
│   │   └── my-project.jsonl        # SessionEntry[] (append-only)
│   ├── history/
│   │   └── my-project.jsonl        # HistoryEntry[] (append-only)
│   ├── orchestration/
│   │   └── my-project.json         # OrchestrationState
│   ├── skills/                     # NEW
│   │   ├── coding-standards.md
│   │   ├── testing.md
│   │   └── registry.json           # Skill { id, name, description, triggers[] }
│   ├── mind/                       # NEW ("the brain" — compiled view)
│   │   ├── snapshot.json           # last `barkcli mind sync` result
│   │   └── digest.md               # human-readable summary (regenerated)
│   ├── checkpoints/
│   │   └── *.json                  # Board snapshots
│   ├── undo/
│   │   └── *.json                  # last N undos
│   └── locks/                      # fs2 lock files (ephemeral)
├── my-project.board                # Board YAML (committed)
├── my-project.sprint.board? -> no, sprints in .board; alternative: keep boards/*.board
└── .git/hooks/post-commit          # optional: `barkcli context sync --quiet`
```

**Current vs target delta:**

- Already exists: `tasks/`, `agents/`, `memory/`, `context/`, `specs/`, `sprints/`, `sessions/`, `history/`, `orchestration/`, `checkpoints/`, `undo/`
- **New:** `skills/` and `mind/` — the mind is a derived cache, not source of truth.

### 6.2 Write Guarantees

- All mutating `storage/*` functions **must** go through `util/lock.rs: with_lock(path, || ...)` (currently `queue.rs:319` and `specs.rs` do; `board_file.rs:write_board` must be wrapped too — fix G1).
- Atomic write: write to `*.tmp` then `rename` (already done in `barkcli-server/src/lib.rs:461-462` for board save; extend to all L2 writers).
- `Card.version` already incremented on `touch():111` — wire to optimistic concurrency: if `read_board` version ≠ expected, reject with actionable error.

### 6.3 File Formats

- `*.board` stays YAML (human-friendly, diff-friendly). Keep `#[serde(default, skip_serializing_if…)]` discipline so merges rarely conflict.
- `.board/**/*.json` for machine-written (queue, memory, context). JSONL for append-only logs (history, sessions) — enables `tail` and cheap incremental read.

---

## 7. Domain Model Evolution <a id="7-domain"></a>

### 7.1 Keep (no breaking change)

- `Board`, `Card`, `Column`, `Spec`, `Requirement`, `TaskRequest`, `FileContext`, `Sprint`, `SessionEntry` — all stable, additive evolution only.

### 7.2 Add

```rust
// NEW: Skill — reusable capability / convention (markdown + frontmatter)
pub struct Skill {
    pub id: String,                 // slug of file name: "coding-standards"
    pub name: String,               // "Coding Standards"
    pub description: String,        // one-liner
    pub content: String,            // full markdown (injected into agent prompt)
    pub triggers: Vec<String>,      // ["review", "plan", "intake"] or ["rust", "backend"]
    pub source: SkillSource,        // Builtin | Project | User
    pub created_at: DateTime<Utc>,
}

// NEW: MindSnapshot — compiled "what's happening" (derived, not edited by hand)
pub struct MindSnapshot {
    pub board_name: String,
    pub generated_at: DateTime<Utc>,
    pub stats: BoardStats,          // card counts by column/priority/label
    pub active_sprint: Option<Sprint>,
    pub blockers: Vec<Blocker>,     // card blocked_by + links BlockedBy
    pub stale_cards: Vec<String>,   // >7d in doing/review
    pub next_actions: Vec<String>,  // e.g. "run barkcli plan login-bug"
    pub recent_history: Vec<HistoryEntry>, // last 10
    pub recent_sessions: Vec<SessionEntry>,// last 10
    pub top_memories: Vec<MemoryEntry>,    // search "project conventions"
    pub velocity: Option<VelocityReport>,
}

// NEW: Roadmap/Milestone (Larger than Sprint)
pub struct Milestone {
    pub id: String,
    pub title: String,
    pub due: Option<String>,        // YYYY-MM-DD
    pub cards: Vec<String>,         // card ids
    pub status: MilestoneStatus,    // planned | active | done
}

// EXISTING: strengthen links
// Card already has `links: Vec<CardLink>` + `acceptance_criteria`, `effort`, `area`.
// Add `spec_id: Option<String>` to Card (nullable, back-compat) so traceability
// is O(1) instead of scanning specs[].requirements[].linked_tasks.
```

### 7.3 Link Semantics (clarify)

- `Parent/Child` = decomposition (intake card → plan child cards). Rendered as tree (`barkcli tree`).
- `BlockedBy` = dependency (card blocked_by or link ty BlockedBy). `next_pending:199` already respects `TaskRequest.dependencies` (task-level); extend to card-level `BlockedBy` in orchestration.
- `Related` = lateral association (no scheduling implication).
- Spec link: `Requirement.linked_tasks` ↔ `Card.spec_id` ↔ `TaskRequest.card_id` — triple join.

---

## 8. Management Pipeline <a id="8-pipeline"></a>

```
Human text
   │
   ▼ intake (LLM classify) ──────► Card + Spec
   │                               (barkcli-core/src/commands/intake.rs:42)
   │                               heuristic fallback when no LLM
   ▼ plan (LLM decompose) ───────► child Cards + TaskRequests
   │                               (commands/plan.rs:48, decompose.rs)
   ▼ dispatch (assign) ──────────► TaskQueue.claim by AgentRegistry.best_agent_for_task
   │                               (agent/identity.rs:212, queue.rs:249)
   ▼ execute (coding agent) ─────► branch → code → test → commit
   │                               (barkcli-cli/src/listener.rs:179 process_task)
   ▼ review (gate) ──────────────► checklist ✓, tests ✓, AC ✓ → move to done
   │                               (commands/review.rs:14)
   ▼ memory (learn) ─────────────► MemoryStore + ProjectFact + mind snapshot
                                   (memory/store.rs:107)
Loop: monitor watches all stages; undo rewinds; checkpoint snapshots.
```

**Key design fixes:**

- **Heuristic fallback for intake/plan** when `resolve_config:53` fails — classify by keywords (`bug: crash/error`, `feature: add/build`) so `barkcli intake "fix auth"` works offline and creates a usable card even without LLM.
- **OrchestrationEngine persists** — on `run_cycle:94` load `TaskQueue` and `AgentRegistry` from disk (fix G3), then `save` after dispatch.
- **Context injection on dispatch** — `dispatch_task:257` must call `populate_context_files:341` (fix G4) and optionally include `CallGraph` slice + `MemoryStore.search(card.title,3)`.

### 8.1 Command Matrix (target)

| Command | Offline? | LLM? | Mutates | MCP equivalent |
|---------|----------|------|---------|---------------|
| `barkcli init` | ✅ | no | `.board/` | — |
| `barkcli add/list/move/done` | ✅ | no | `*.board` | `card_create/card_list/card_move` |
| `barkcli intake "text"` | heuristic ✅ | LLM optional | card+spec | `intake` (new) |
| `barkcli intake --dry-run` | ✅ | LLM | none | — |
| `barkcli plan <id>` | ✅ | LLM | child cards | `plan` (new) |
| `barkcli plan --tasks` | ✅ | LLM | queue | — |
| `barkcli dispatch` | ✅ | no | queue assign | `task_claim` |
| `barkcli monitor` | ✅ | no | none | `orchestrate/status` |
| `barkcli review <id>` | ✅ | heuristic | board | — |
| `barkcli memory add/search` | ✅ | no | `.board/memory` | `memory_add/memory_search` |
| `barkcli mind sync` | ✅ | no | `.board/mind` | `mind/snapshot` (new) |
| `barkcli overview` | ✅ | no | none | `overview` (new) |
| `barkcli context scan/sync` | ✅ | no | `.board/context` | `context_scan` |
| `barkcli skills list/show` | ✅ | no | `.board/skills` | `skill_list` (new) |

---

## 9. Skill System <a id="9-skills"></a>

**What it is:** Project-local reusable instructions for agents, stored as markdown in `.board/skills/` — inspired by Claude Code skills + git hooks, but version-controlled and injected automatically.

**Why not just prompts:** Skills are *curated, reviewed, and shared* conventions. A junior agent and a senior agent get the same `coding-standards` skill, so output converges.

### 9.1 Skill File Format

```markdown
---
id: coding-standards
name: Coding Standards
description: Rust conventions for this repo
triggers: [plan, review, rust, backend]
---

# Coding Standards

- Always return `Result<T>` from public APIs (`memory/store.rs:114` pattern)
- Use `anyhow::Context` for error messages
- Run `cargo test` before commit
- Keep files under 400 LOC; split if larger
```

### 9.2 Registry

- `barkcli skills list` scans `.board/skills/*.md` + `~/.board/skills/*.md` (user global) + builtins (`barkcli-core/skills/*.md` embedded via `include_str!`).
- `barkcli skills install <id>` copies from registry or URL.
- On `intake/plan/listener::build_agent_prompt`, matching skills (by `triggers` intersecting card labels/area) are concatenated as `## Project Skills` section. Max ~4 skills to stay within context window; overflow goes to `.board/mind/digest.md` reference.

### 9.3 Implementation Files

- NEW `barkcli-core/src/skills/mod.rs` + `registry.rs` + `loader.rs`
- NEW `barkcli-core/src/commands/skills.rs`
- Modify `barkcli-cli/src/listener.rs: build_agent_prompt:421` to inject skills
- Modify `barkcli-core/src/commands/intake.rs` + `plan.rs` to inject skills into LLM system prompt
- Add 3 builtin skills: `coding-standards`, `testing`, `commit-message`

---

## 10. Agent Abstraction <a id="10-agents"></a>

**Current:** `AgentIdentity` + `AgentRegistry` + `AgentRole` (4 roles) + `TaskQueue` (`barkcli-core/src/agent/`). MCP exposes `agent_register/agent_status/agent_list/agent_heartbeat` (`mcp.rs:616-899`).

**Target: one trait, many backends.**

```rust
pub trait AgentBackend {
    fn name(&self) -> &str; // "opencode" | "claude-code" | "human" | "mock"
    fn detect(&self) -> bool; // which() + config check
    fn invoke(&self, prompt: &str, workdir: &Path) -> Result<String>;
}

// Implementations in barkcli-cli/src/agents/:
// - opencode.rs (subprocess, JSON output)
// - claude_code.rs
// - cursor.rs (future)
// - human.rs (just writes prompt file to .board/tasks/<id>_prompt.md)
```

- `barkcli agent list --available` probes `which` for each backend.
- `barkcli dispatch --agent <id>` respects `AgentRegistry.best_agent_for_task:213` (filters by `can_accept_task:149`).
- Add `AgentBackend::stream` later for live TUI log view.
- Server `register_agent_handler:1356` and `agent_heartbeat:1868` stay as-is; listener already heartbeats (`listener.rs:615 send_heartbeat`).

---

## 11. Memory & Mind <a id="11-memory"></a>

### 11.1 Memory System (already strong — polish, don't rewrite)

- Keep 4-tier model (`memory/tiers.rs:15-45`): Working 20 / Short 100 / Long 500 / External 10k — limits are sane.
- Keep hybrid BM25(60%)+TF-IDF(40%) + tier/recency boosts (`memory/search.rs:52-58`) — fully offline, no API.
- **Fixes/improvements:**
  - **Auto-capture:** `storage/sessions.rs` and `storage/history.rs` append on every mutation; add `memory auto-capture` hook (or extend `hooks.rs:install`) that on `session log` and `context sync` auto-adds a `ShortTerm` entry: `memory add --tier short --source session:<id> "<summary>"`.
  - **Git-aware facts:** on `context sync`, if `last_commit_files` touches a `linked_code` file, auto-add `ProjectFact { category: "decision", fact: "<file> changed (commit <sha>)" }`.
  - **Prompt injection:** on `plan`/`intake`, call `store.search(card.title, 3)` and inject top memories into LLM context (like harness).
  - **Optional ONNX:** feature-flag `fastembed` / `ort` later for dense embeddings; keep TF-IDF as default so `cargo install` doesn't pull 200MB model.

### 11.2 Mind — the Compiled View

`Mind` is **not** storage; it is a *derived* snapshot regenerated by `barkcli mind sync` (or `overview`). Think `git status` but for management.

**`barkcli mind sync` does:**

1. Load Board + TaskQueue + AgentRegistry + MemoryStore + BoardContext + Sprints + History + Sessions.
2. Compute `MindSnapshot` (see §7.2): counts by column/priority, blockers (card.links BlockedBy + TaskQueue dependencies), stale (>7d), velocity (`agent/capacity.rs`), insights (same logic as `monitor.rs: generate_insights:190` + `orchestrate.rs: analyze_board:151`).
3. Write `.board/mind/snapshot.json` + render `.board/mind/digest.md` (human-readable, good for pasting into agent prompt as "project context").
4. Also serve via `GET /api/mind` and MCP `mind_snapshot`.

**`barkcli overview` / `barkcli status --mind` / web Dashboard:**

- Render snapshot as 4 panels: (1) Board health, (2) Sprint/velocity, (3) Blockers & stale, (4) Recent activity + next actions.
- Reuse `monitor.rs: render_dashboard:41` but add `MindSnapshot` section at top.

**Files:**

- NEW `barkcli-core/src/mind/mod.rs` + `snapshot.rs` + `digest.rs`
- NEW `barkcli-core/src/commands/mind.rs` + `overview.rs`
- Modify `barkcli-server/src/lib.rs` add `/api/mind` route

---

## 12. Context Engine 2.0 <a id="12-context"></a>

**Current:** `code/symbols.rs: regex` → `code/index.rs: SymbolIndex { files: [{path, symbols}] }` → `commands/context.rs: scan/link/status/show/sync/autosync/clear` → `storage/context.rs: BoardContext` (`barkcli-core/src/models/context.rs`).

**Keeps:** Regex-based symbols — good enough, zero deps, fast. `SymbolIndex::match_title` token overlap is effective for map-to-file.

**Upgrade path (no breaking change):**

1. **Fill G4:** Ensure every `TaskRequest.context_files` is populated at creation time via `populate_context_files:341` (fix orchestration + `mcp.rs: task_create:1409` already does; `orchestrate.rs: dispatch_task:257` must).
2. **Call graph slice:** `code/callgraph.rs` already builds edges from `index.files`; inject top 5 callees/caller for each `FileContext` (currently `call_graph: None`).
3. **Metrics hint:** `code/metrics.rs: compute_metrics` already exists; add `complexity`/`test_coverage` to `FileContext.test_coverage` string so agents know risky files.
4. **Git-aware stale:** `context/sync:269` already compares `last_commit_files` + `dirty_files` → status `clean/changed/deleted`; extend to mark `Requirement.stale` when its `linked_code` path appears in `last_commit_files` (wires specs ↔ git).
5. **Autosync polish:** `context/autosync:338` writes `.git/hooks/post-commit`; make it idempotent and board-aware (already does via `marker:346`).
6. **v2 optional:** tree-sitter feature flag for precise symbols when user opts in (`--features tree-sitter`).

---

## 13. Orchestration & Delegation <a id="13-orchestration"></a>

**Current state fixed in this plan (G3):**

```rust
// barkcli-core/src/agent/orchestrate.rs — proposed fix in OrchestrationEngine::new
pub fn new(board_name: &str, role: AgentRole, board: Board) -> Result<Self> {
    let board_dir = find_board_dir()?;
    let queue = TaskQueue::load(&board_dir.join("tasks").join(format!("{}.json", board_name))).unwrap_or_default();
    let registry = AgentRegistry::load(&board_dir.join("agents/registry.json")).unwrap_or_default();
    let velocity = VelocityTracker::load(&board_dir.join("sprints/..."))...;
    // ...
}
pub fn run_cycle(&mut self) -> Result<CycleResult> {
    // 1. analyze_board
    // 2. decompose_ready_cards (skip if already has active tasks, skip if blocked)
    // 3. for each plan, create tasks WITH context_files populated
    // 4. queue.save() BEFORE dispatch
    // 5. dispatch: assign via registry.best_agent_for_task
    // 6. monitor + evaluate
}
```

**Delegation UX:**

- `barkcli dispatch` = run one orchestration cycle (alias to `barkcli orchestrate cycle` which already exists server-side `POST /api/orchestrate/cycle:109`).
- `barkcli dispatch --agent <id>` = pin dispatch to that agent (override `best_agent_for_task`).
- `barkcli listener --agent-id <id> --once --dry-run` already shows task details (`listener.rs:129`).
- **Priority & dependencies:** `TaskQueue::next_pending:199` already sorts by `critical>high>medium>low` + `created_at` and respects `dependencies_met:218`. Extend insight: if a task's `dependencies` not met, `monitor` shows `blocked by task-xyz`.

**Capacity:**

- `agent/capacity.rs: VelocityTracker` exists but disconnected — wire it: on `complete_task:968` update `VelocityTracker.record(spent_points)`, on `dispatch` check `remaining_capacity = sprint_capacity - assigned_points`.

---

## 14. Planning & Overview <a id="14-planning"></a>

### 14.1 Existing Planning

- `barkcli intake` (human → card+spec) + `barkcli plan --tasks` (card → child cards + queue) + `barkcli sprint start/end` + calendar/agenda (`barkcli-core/src/commands/agenda.rs`) + Dashboard/Reports/Calendar views (web).

### 14.2 Additions

- **Milestones/Roadmap:** `models/milestone.rs` + `storage/milestones.rs` + `barkcli milestone create/list/show` + web Roadmap view (Gantt-lite). Milestone aggregates cards by `labels: milestone:<id>` (same pattern as sprint labels `sprint:<name>` in `barkcli-server/src/lib.rs:512`).
- **Overview command:** `barkcli overview` (or `barkcli status --overview`) renders MindSnapshot as boxed sections — no LLM needed:
  ```
  Board: my-project  23 cards (todo:8 doing:4 review:2 done:9)
  Sprint: Sprint 2  ████████░░  8/12 done  velocity 11
  Blockers: 2  • auth-middleware blocked by jwt-validation
  Stale: 1  • payment-hook (in doing, 9d)
  Next: barkcli plan auth-middleware --tasks → dispatch
  Recent: [history 5] [sessions 3] [memory: "we decided to use axum"]
  ```
- **Web Overview:** Merge `Dashboard + MemoryView + OrchestrateView` live data into one "Mind" tab.

---

## 15. Interfaces <a id="15-interfaces"></a>

### 15.1 CLI (core)

- Keep flat `barkcli <cmd>` + legacy `barkcli <board> <cmd>` (`cli.rs:507 handle_legacy`). Add new cmds:
  - `barkcli overview` — human narrative (see §14)
  - `barkcli mind sync` + `barkcli mind show` — compile/show MindSnapshot
  - `barkcli skills list/show/install` — skill registry (§9)
  - `barkcli dispatch` — alias to `orchestrate cycle` single run
  - `barkcli doctor --fix` already auto-fixes; extend to report mind staleness
- Help text (`cli.rs:637 print_usage`) grows a "Management layer" section already present — keep updated.

### 15.2 TUI (`barkcli-tui`)

- Current: `barkcli-tui/` ratatui board kanban.
- Add 2 tabs: **Orchestrate** (queue table + agent list + cycle button) and **Mind** (snapshot + digest preview). Reuse `commands/monitor.rs: render_dashboard` as TUI widget source.

### 15.3 Web (`web/` React + Vite, `barkcli-server` axum)

- Current: Dashboard/Board/Calendar/Reports/Code/Activity/Sprints/Memory/Specs/Orchestrate/Timeline/Settings/Docs (`web/src/App.tsx:46`). Good coverage.
- **Changes:**
  - Add **Mind** route (snapshot + digest markdown render) — primary landing when orchestration active.
  - `OrchestrateView` live queue: subscribe to `connectWs` reload, add `POST /api/orchestrate/cycle` button + `GET /api/tasks?status=pending` table.
  - `MemoryView` add "Auto-capture" toggle + search type switch (hybrid/BM25/semantic).
  - Keep `ServeDir::new("web/dist")` fallback (`barkcli-server/src/lib.rs:156`).

### 15.4 VS Code Extension (`vscode-extension/`)

- Already: Custom Editor for `*.board` files.
- Add: status bar `barkcli: 3 doing, 1 blocked` (read `.board/mind/snapshot.json`), command palette `Bark: Intake`, `Bark: Overview`.

### 15.5 MCP (`barkcli-core/src/mcp.rs` + `barkcli mcp`)

- Already 33 tools; add 5:
  - `mind_snapshot` — returns `MindSnapshot` JSON
  - `overview` — human text overview
  - `skill_list` / `skill_get` — skill registry
  - `intake` — structured intake without CLI
- Keep protocol: stdio JSON-RPC 2.0, `initialize → tools/list → tools/call` (`mcp.rs:132-211`).

### 15.6 Hooks (`barkcli-core/src/commands/hooks.rs`)

- Keep `hooks install/remove/status` for opencode/claude-code agent hooks.
- Add `hooks install --mind-sync` = git `post-commit` that runs `barkcli mind sync --quiet` + `barkcli context sync --quiet`.

---

## 16. Offline AI Strategy <a id="16-offline"></a>

**Non-negotiable:** `barkcli add/list/move` must work on a plane. So must `memory search`, `context scan`, `mind sync`, `overview`, `monitor`.

**LLM-required features degrade, not fail:**

| Feature | Online (LLM) | Offline Fallback |
|---------|--------------|-----------------|
| `intake` | LLM classification → rich AC | Heuristic: keyword rules (`crash→bug/priority high`, `add→feature`), AC templated |
| `plan` | LLM child cards | Heuristic: split by `effort>5` → 2 cards, or use `decompose.rs: algorithmic` path (`agent/decompose.rs:1-468`) |
| `memory search` | same (local TF-IDF) | same — no change, fully local |
| `review` | LLM AC check | Heuristic: `checklist done == total` + `tests_passed` |
| `mind digest` | LLM summary (optional) | Template-rendered markdown from snapshot |

**Provider resolution** already offline-friendly (`ai/provider.rs:53-112`): `localhost` → no key needed, Ollama default `llama3.2`. Keep it; add `barkcli ai config set provider ollama` quickstart.

**Future:** feature `ort-embed` for ONNX dense embeddings (optional, not default) — project `memory` gains semantic recall without API.

---

## 17. Git Integration <a id="17-git"></a>

- **`.board/.gitignore`** already ignores machine state (`history/sessions/context/locks/memory/mind` tmp) — keep but also ignore `tasks/*_prompt.md` (agent prompts).
- **Committed:** `*.board` + `.board/config.json` + `.board/skills/*.md` + `.board/milestones/*.json` — all diff-able, merge-able.
- **Board ↔ git:**
  - `context sync` (`commands/context.rs:269` + `barkcli-server/src/lib.rs:687 sync_context_handler`) compares `current_commit`, `last_commit_files`, `dirty_files` (`util/git.rs`) → file `status`.
  - Extend: same signal marks `Spec.requirement.stale` + `MindSnapshot.blockers`.
  - `listener.rs: create_git_branch:342`, `commit_changes:565` already correct — add `git fetch` check for remote ahead warning in `overview`.
- **History:** `storage/history.rs` logs every `board move/update/add` as `HistoryEntry { op, field, old_value, new_value, at }` — feed into `mind` + `blame:214`.

---

## 18. Extensibility <a id="18-extensibility"></a>

- **No plugin runtime for v2** — skills + agent backends cover 90%. Keep core small.
- **Escape hatches:**
  - `barkcli export/import` (`commands/export.rs`, `import.rs`) already JSON/YAML — use for ad-hoc integrations.
  - `barkcli-server` open API (all `/api/*` routes) + MCP tools — anything can script barkcli.
  - `.board/skills/*.md` is the extension point for *behavior* (markdown is portable).
- **Later:** WASM plugin system if demand proven — not in v2 scope.

---

## 19. Open Source Positioning <a id="19-oss"></a>

- **License:** MIT (keep). No dual-license, no "open core" gate on CRUD/mind/skills.
- **Distribution:** `cargo install barkcli` primary, `brew install AkshatNaruka/barkcli/barkcli` + `curl .../install.sh` + GitHub Releases — all already wired (`.github/workflows/release.yml`, `Formula/`, `landing-next/`).
- **Docs site:** `landing-next/` (Next.js) already markets barkcli — add a "Management Layer" section with the pipeline diagram and `.board` layout.
- **AI Agent Prompt:** `docs/AI_AGENT_PROMPT.md` already exists — update it to include `mcp` tool names + `mind` context.
- **Governance:** `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md` + issue templates (already have `.github/`).

---

## 20. Roadmap: 6 Phases, 10 Weeks <a id="20-roadmap"></a>

| Phase | Goal | Key Tasks | Verifiable Done |
|-------|------|-----------|-----------------|
| **P0: Harden (Week 1)** | Fix G1-G3, make core rock-solid | Wrap `board_file::write_board` in `with_lock`, atomic tmp→rename everywhere; `OrchestrationEngine::new` loads queue/registry from disk; `dispatch_task` populates `context_files` | `cargo test` parallel stress test (10 threads `add` + `mcp card_create`) no corruption; `orchestrate cycle` persists across restarts |
| **P1: Mind + Overview (Week 2)** | Single "what's happening" view | NEW `mind/snapshot.rs`, `commands/mind.rs`, `commands/overview.rs`, server `/api/mind`, MCP `mind_snapshot` | `barkcli mind sync && cat .board/mind/digest.md` shows board+sprint+blockers+next; `barkcli overview` prints it |
| **P2: Skills (Week 3)** | Reusable conventions | NEW `skills/` module, `commands/skills.rs`, 3 builtin skills, inject into intake/plan/listener prompts | `barkcli skills list` shows 3; `barkcli intake "add auth"` includes skill content in LLM prompt; listener prompt includes matching skill |
| **P3: Intake/Plan Polish (Week 4)** | Graceful offline + richer context | Heuristic fallback for intake/plan; inject memory(3)+skills(2)+callgraph into plan prompt; `Card.spec_id` field | `BARKCLI_API_KEY="" barkcli intake "fix crash on checkout"` creates card with heuristic classification; plan with `--tasks` has non-empty `context_files` |
| **P4: Orchestration Complete (Week 5-6)** | End-to-end dispatch→review loop | Wire `VelocityTracker` into cycle; `TaskRequest.dependencies` populated from card links; server/mcp queue consistency; listener backend trait | `barkcli plan <id> --tasks && barkcli dispatch && barkcli listener --once` completes one task end-to-end; `review --auto` moves card |
| **P5: Interfaces (Week 7-8)** | TUI + Web + VSCode show mind/skills | TUI Orchestrate+Mind tabs; Web Mind route + live queue; VS Code status bar; docs update | `cargo run -- tui` shows Mind tab; `barkcli serve` shows Mind route with live reload |
| **P6: Milestones + Polish + Release (Week 9-10)** | Planning horizon + release | Milestone model+storage+CLI+Web Roadmap; `doctor` reports mind staleness; `landing-next` docs; `v0.3.0` tag | `barkcli milestone create "Q4 Launch" --due 2026-12-01` + web Roadmap gantt; `cargo test` green; release artifacts built |

**Conservative scope:** P0-P2 ship a visibly "management layer" product. P3-P6 deepen it. Each phase is independently shippable.

---

## 21. File Impact Matrix <a id="21-files"></a>

### New Files (10)

```
barkcli-core/src/skills/mod.rs
barkcli-core/src/skills/registry.rs
barkcli-core/src/skills/loader.rs
barkcli-core/src/skills/builtin.rs          # include_str! 3 md files
barkcli-core/src/skills/coding-standards.md
barkcli-core/src/skills/testing.md
barkcli-core/src/skills/commit-msg.md
barkcli-core/src/mind/mod.rs
barkcli-core/src/mind/snapshot.rs
barkcli-core/src/mind/digest.rs
barkcli-core/src/commands/skills.rs
barkcli-core/src/commands/mind.rs
barkcli-core/src/commands/overview.rs
barkcli-core/src/models/milestone.rs
barkcli-core/src/storage/milestones.rs
barkcli-core/src/agent/backend.rs           # AgentBackend trait + registry
barkcli-cli/src/agents/mod.rs
barkcli-cli/src/agents/opencode.rs
barkcli-cli/src/agents/claude_code.rs
barkcli-cli/src/agents/human.rs
```

### Modified Files (14)

```
barkcli-core/src/lib.rs                          # pub mod skills, mind
barkcli-core/src/cli.rs: dispatch               # add mind, skills, overview, milestone
barkcli-core/src/storage/board_file.rs           # wrap write in with_lock + atomic
barkcli-core/src/util/lock.rs                    # ensure fs2 cross-platform
barkcli-core/src/agent/orchestrate.rs:65         # load queue/registry; dispatch context
barkcli-core/src/agent/queue.rs:257              # dispatch_task context population
barkcli-core/src/storage/mod.rs                  # export milestones
barkcli-core/src/models/mod.rs                   # export Skill, MindSnapshot, Milestone
barkcli-core/src/models/card.rs: Card            # add spec_id: Option<String>
barkcli-core/src/commands/intake.rs:60            # heuristic fallback + skill injection
barkcli-core/src/commands/plan.rs:62              # heuristic fallback + memory/skill inject
barkcli-core/src/commands/context.rs             # mark spec stale on sync
barkcli-core/src/mcp.rs: handle_tools_list/call  # add 5 tools
barkcli-core/src/memory/store.rs: add()           # auto-capture hook (optional)
barkcli-cli/src/listener.rs:179,421               # backend trait, skill injection
barkcli-server/src/lib.rs:79                     # add /api/mind, /api/skills, /api/milestones
barkcli-server/src/lib.rs:686-746                 # extend sync to mark stale
web/src/App.tsx:46                               # add Mind route
web/src/components/MindView.tsx                  # NEW component
web/src/components/SkillsView.tsx                # NEW component
web/src/lib/api.ts                               # add fetchMind, fetchSkills
barkcli-tui/src/app.rs                           # add Orchestrate/Mind tabs
docs/AI_AGENT_PROMPT.md                          # add new MCP tools + mind
```

### No Change (stable)

```
barkcli-core/src/code/*  (symbols/index/metrics/callgraph)
barkcli-core/src/storage/history.rs, sessions.rs, context.rs (good)
barkcli-core/src/commands/validate.rs, doctor.rs, export.rs, import.rs
```

---

## 22. Success Metrics <a id="22-metrics"></a>

| Metric | Target | How Measured |
|--------|--------|--------------|
| `intake → tasks` time | <30s median (with LLM), <1s heuristic | `time barkcli intake "…" && time barkcli plan … --tasks` |
| Context relevance | >80% of `context_files` touched by agent commit | `git diff --name-only HEAD~1` ∩ `task.context_files` |
| Offline operability | 100% of CRUD+memory+context+overview work with no network | `env -u BARKCLI_API_KEY barkcli overview` |
| `cargo test` + parallel stress | 0 flakes over 100× concurrent `add` | CI `stress-test` job |
| Memory recall | top-3 `memory search` feels relevant in user test | dogfood with 50 memories |
| `mind sync` freshness | snapshot <5 min old after `context sync` | timestamp check |
| Time to first board | <20s from `cargo install` to `barkcli add` | fresh container test |

---

## 23. Risks & Mitigations <a id="23-risks"></a>

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM intake misclassification | Medium | Medium | Heuristic fallback + `intake --dry-run` + confidence field, human confirms |
| File-lock contention on busy repo | Low | High | `fs2` advisary locks + atomic rename already proven; add retry with backoff |
| Scope creep to plugin runtime | High | High | **Defer** plugins — skills + backends cover v2; gate new deps via RFC |
| Agent subprocess API drift (opencode/claude) | High | Medium | `AgentBackend` trait isolates; `human` backend always works (prompt file) |
| `*.board` merge conflicts | Medium | Low | Keep YAML minimal defaults, sort keys deterministically, document `barkcli doctor` |
| Embedding quality with TF-IDF only | Medium | Low | Sufficient for short card/memory text; ONNX is opt-in later |

---

## 24. Immediate Next Steps <a id="24-next"></a>

1. **Create branch** `feat/management-v2` from `master`.
2. **P0 PR #1:** Harden storage — `board_file.rs` lock + atomic, `orchestrate.rs` load/persist, `dispatch_task` context. Add `tests/stress_concurrent.rs`.
3. **P1 PR #2:** Mind + Overview — `mind/` module, `barkcli mind sync`, `barkcli overview`, `/api/mind`, MCP `mind_snapshot`. Update `web/src/App.tsx` with Mind route. Merge.
4. **P2 PR #3:** Skills — `skills/` registry + 3 builtins + injection into intake/plan/listener. Wire `barkcli skills list`.
5. Continue P3-P6 per Table §20. Tag `v0.3.0` on P6 green.

**Review checklist before each PR:** `cargo test`, `cargo clippy`, `cargo build --release`, manual `barkcli intake/plan/dispatch/monitor/review` smoke, `barkcli serve --status` live reload.

---

## Appendix A — Pipeline Sequence (happy path)

```
$ barkcli init
$ barkcli create my-project
$ barkcli intake "Add Google OAuth login" --feature
  → Intake: Created card 'add-google-oauth-login' [feature|high|medium|fullstack]
           Spec created

$ barkcli context scan
  → Scan: 8 file→card mappings (auth.rs, oauth.rs …)

$ barkcli plan add-google-oauth-login --tasks
  → Plan: 3 requirements, 3 child cards
         1. Implement OAuth flow [high] effort 5
         2. Store tokens securely [high] effort 3
         3. Add tests [medium] effort 2
         Created 3 tasks in queue

$ barkcli dispatch
  → Dispatched 3 tasks to tech-lead

$ barkcli listener --agent-id opencode-1 --agent-name "opencode" --once
  → Received task: Implement OAuth flow
    1. Claimed  2. Project root …  3. Context: 2 files  4. Branch: barkcli/implement-oauth-flow
    5. Invoking coding agent …  6. Tests passed  7. Changed 3 files  8. Committing … 9. Completed

$ barkcli review --all --auto
  → Review: 1 passed, moved to done

$ barkcli memory search "oauth"
  → Found 2 memories: "decision: use PKCE for OAuth…"

$ barkcli mind sync && barkcli overview
  → Board: 12 cards … Sprint 2: 8/12 … No blockers … Next: plan payment-hook
```

---

## Appendix B — References (code citations)

- Board model `barkcli-core/src/models/board.rs:1-30`
- Card `barkcli-core/src/models/card.rs:1-198`
- Memory hybrid search `memory/search.rs:52-58`
- Intake `commands/intake.rs:42-223`
- Plan `commands/plan.rs:48-336`
- Monitor `commands/monitor.rs:16-335`
- Review `commands/review.rs:14-251`
- Listener `barkcli-cli/src/listener.rs:179-272`
- MCP tools `mcp.rs:239-917`
- Server routes `barkcli-server/src/lib.rs:79-156`
- AI provider `ai/provider.rs:53-112`
- Lock `util/lock.rs` + `queue.rs:319`
- Context `commands/context.rs:15-391`

---

*End of vision. Build the mind.*

---

## Implementation Log v0.3.0-mvp (feat/mvp-all-specs)

- SPEC-001 Harden: `board_file.rs:58 with_lock+atomic`, `update_board`, `orchestrate.rs:65` persistence, `dispatch_task:257` context, `stress_concurrent.rs` 100 cards OK
- SPEC-002 Mind: `mind/snapshot.rs`, `digest.rs`, `commands/mind.rs`, `commands/overview.rs` (offline 4 panels)
- SPEC-003 Skills: `skills/builtin/{mvp,planning,scrum-master,test}.md`, `registry.rs` load_all, `commands/skills.rs`, heuristic fallback for `intake`/`plan`, `listener.rs:421` prompt injection
- SPEC-004 Team: `models/card.rs` `spec_id`, `barkcli-server` `/api/mind`+`/api/skills` (axum 0.8 `{param}`), `mcp.rs` 5 tools →38 total
- SPEC-005 Polish: version 0.3.0, README mind/skills/dispatch, `docs/content/AI_AGENT_PROMPT.md` 38 tools

`cargo test:86 passed`, `cargo build` release OK, offline smoke `BARKCLI_API_KEY="" intake→plan→mind→overview→dispatch` verified.

Tag: `v0.3.0-mvp` on `feat/mvp-all-specs`.
