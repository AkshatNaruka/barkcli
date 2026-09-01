# Management Layer Plan — barkcli Human-to-Agent Pipeline

> Research completed. This document proposes a complete management layer that sits between humans and coding agents, handling the full lifecycle from natural language input → specs → tasks → code → review.

---

## 1. Current State Assessment

### What Already Exists (~4,500 lines of agent code)

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Agent Identity & Registry | `agent/identity.rs` | 266 | Complete |
| Roles & Capabilities (4 roles) | `agent/roles.rs` | 246 | Complete |
| Task Queue (with retry logic) | `agent/queue.rs` | 351 | Complete |
| Task Decomposition (role-based) | `agent/decompose.rs` | 468 | Complete |
| Velocity/Capacity Planning | `agent/capacity.rs` | 328 | Complete but disconnected |
| Orchestration Engine | `agent/orchestrate.rs` | 423 | Partially connected |
| MCP Server (25+ tools) | `mcp.rs` | 1702 | Most complete interface |
| HTTP API (barkcli-server) | `lib.rs` | ~1300 | All endpoints exist |
| Listener (polling worker) | `listener.rs` | 188 | **Skeleton** — no real work |
| Agent Hooks (OpenCode/Claude) | `hooks.rs` | 342 | Complete |
| Context System | `commands/context.rs` | ~400 | File-path based, no vectors |
| Spec System | `commands/spec.rs` | ~400 | Disconnected from orchestration |
| Session Capture | `storage/sessions.rs` | ~200 | Works, no cross-session memory |

### Critical Gaps Identified

1. **Listener is a skeleton** — claims and immediately completes tasks without doing any work
2. **No memory system** — no embeddings, vectors, or RAG. Context is regex/token-based fuzzy matching
3. **Specs disconnected from orchestration** — specs exist but the engine never reads them
4. **No task dependency resolution** — `TaskRequest.dependencies` field exists but `next_pending()` ignores it
5. **Agent state never updated** — server doesn't call `start_task()`/`complete_task()` on the registry
6. **No context population in tasks** — `context_files` is always empty when tasks are created
7. **HTTP method mismatch** — listener sends `PUT /api/agents`, server accepts `POST`
8. **No distributed locking** — concurrent agents can race on the same JSON files
9. **Decomposition is algorithmic** — the orchestration path doesn't use LLMs for decomposition (only `agent propose` does)
10. **No cross-session memory** — each session starts fresh, no learning from past work

---

## 2. Architecture: The Management Layer

### 2.1 Conceptual Model

```
┌─────────────────────────────────────────────────────────┐
│                    HUMAN INPUT LAYER                     │
│  "Add login with Google" / "Fix the crash on checkout"  │
│  "Build MVP for notifications" / Paste a bug report      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              MANAGEMENT LAYER (NEW)                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   INTAKE     │  │  SPEC GEN    │  │  DECOMPOSE   │  │
│  │              │  │              │  │              │  │
│  │ Parse input  │→│ Create spec  │→│ Break into   │  │
│  │ Classify     ││ Requirements ││ tasks/PBIs   │  │
│  │ Prioritize   ││ Acceptance   ││ Dependencies │  │
│  │              ││ criteria     ││ Estimation   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  DISPATCH    │  │  MONITOR     │  │  REVIEW      │  │
│  │              │  │              │  │              │  │
│  │ Assign to    │←│ Track status │←│ Validate     │  │
│  │ agents       ││ Heartbeats   ││ Merge/close  │  │
│  │ Context prep ││ Reassign     ││ Update specs │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              MEMORY & CONTEXT ENGINE              │   │
│  │                                                   │   │
│  │  Per-card memory · Per-agent memory · Project memory│  │
│  │  Session history · Decision log · Code patterns   │   │
│  │  Semantic search · Automatic context compression │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 CODING AGENT LAYER                       │
│  OpenCode · Claude Code · Cursor · Copilot · etc.       │
│  Receives structured tasks with full context            │
│  Reports back via MCP or HTTP                           │
└─────────────────────────────────────────────────────────┘
```

### 2.2 New CLI Commands

```
barkcli intake "Add Google OAuth login"     # Parse → classify → create card + spec
barkcli intake --bug "Crash on checkout"    # Bug-specific intake flow
barkcli intake --mvp "Notification system"  # MVP scoping intake

barkcli plan <card-id>                      # Generate spec + decomposition for a card
barkcli plan --auto                         # Auto-plan all unplanned cards in todo

barkcli dispatch [board]                    # Assign tasks to available agents
barkcli dispatch --agent <id>               # Dispatch to specific agent

barkcli monitor [board]                     # Dashboard: agent status, stuck tasks, progress
barkcli monitor --watch                     # Live monitoring loop

barkcli review <card-id>                    # Validate agent output against acceptance criteria
barkcli review --all                        # Review all completed cards
```

---

## 3. Component Deep-Dive

### 3.1 Intake Engine — Human Input → Structured Work

**Purpose:** Accept natural language from humans, classify it, and create properly structured cards + specs.

**Flow:**
1. User runs `barkcli intake "Add dark mode toggle to settings page"`
2. Intake engine calls LLM to classify:
   - **Type:** feature / bug / chore / spike
   - **Priority:** critical / high / medium / low
   - **Scope:** small (< 1 day) / medium (1-3 days) / large (> 3 days)
   - **Area:** frontend / backend / infra / docs
   - **Labels:** auto-detected from content
3. Creates a card on the board with all metadata
4. Creates a spec with requirements and acceptance criteria
5. If scope is "large", suggests decomposition

**Implementation:**
- New file: `barkcli-core/src/commands/intake.rs`
- LLM prompt: structured JSON output with classification + card data
- Integrates with existing `card::add` and `spec::create`

### 3.2 Spec Generator — Card → Requirements

**Purpose:** For any card, generate a proper spec with requirements, acceptance criteria, and code/test linkage hints.

**Flow:**
1. User runs `barkcli plan <card-id>`
2. Reads card data + code context (files, symbols, call graph)
3. Calls LLM to generate:
   - Requirements list (with RFC 2119 keywords: MUST, SHALL, SHOULD)
   - Acceptance criteria per requirement (Given/When/Then format)
   - Suggested code files to modify
   - Risk assessment
   - Estimated effort per requirement
4. Creates/updates the spec
5. Optionally creates child cards linked to the spec

**Implementation:**
- New file: `barkcli-core/src/commands/plan.rs`
- Extends existing `spec::create` and `agent::propose` patterns
- Uses existing `SymbolIndex` for code context

### 3.3 Decomposition Engine — Spec → Tasks

**Purpose:** Break specs into agent-ready tasks with proper context.

**Current state:** `decompose.rs` does algorithmic decomposition by role. This needs LLM enhancement.

**Enhancement plan:**
1. Read the spec + requirements
2. For each requirement, generate:
   - Task title and description
   - Acceptance criteria
   - Context files (from spec's `linked_code` + call graph analysis)
   - Dependencies (which other tasks must complete first)
   - Estimated effort
   - Risk level
3. Create `TaskRequest` objects in the queue with populated `context_files`

**Implementation:**
- Enhance `agent/decompose.rs` with LLM-powered decomposition
- Add `context_files` population from `BoardContext` + `SymbolIndex`
- Add dependency resolution to `queue.rs::next_pending()`

### 3.4 Dispatcher — Tasks → Agents

**Purpose:** Assign tasks to the right agents with full context.

**Current state:** `orchestrate.rs` has the framework but doesn't populate context. `listener.rs` is a skeleton.

**Fixes needed:**
1. Fix HTTP method mismatch (`PUT` → `POST` in listener)
2. Populate `context_files` when creating tasks (read from `BoardContext`)
3. Wire agent state mutations through claim/complete/fail handlers
4. Add file locking for concurrent access

**Enhancement:**
- Context preparation: before dispatching, gather all relevant context:
  - Card metadata (title, description, AC, priority, labels)
  - Mapped code files (from context system)
  - Related cards (parent, children, blocked-by)
  - Recent git history on relevant files
  - Session history (past work on this card)
  - Spec requirements (if linked)

**Implementation:**
- Fix `barkcli-server/src/lib.rs` agent registration handler
- Add context population in `mcp.rs` task_create and server task creation
- Add file locking in `storage/` module

### 3.5 Monitor Dashboard — Real-time Status

**Purpose:** Human-visible dashboard of agent activity and progress.

**Output format (TUI or web):**
```
Agent Status:
  opencode (tech-lead)    ▓▓▓░░  working: implement-jwt    last active: 2m ago
  claude-code (dev)       ░░░░░  idle                       last active: 15m ago

Task Queue:
  PENDING  (3)  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░
  ASSIGNED (1)  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░
  IN_PROGRESS(1)▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░
  COMPLETED (7) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

Insights:
  ⚠ Card "auth-system" blocked by incomplete "jwt-validation"
  ⚠ Agent "claude-code" idle for 15m — consider reassignment
  ✓ Sprint velocity: 12 pts (improving +10%)
```

**Implementation:**
- New file: `barkcli-core/src/commands/monitor.rs`
- Uses existing `AgentRegistry`, `TaskQueue`, `OrchestrationState`
- Can run as TUI tab (tab 9) or CLI command

### 3.6 Review Engine — Validate & Close

**Purpose:** When an agent completes a task, validate the output before merging.

**Flow:**
1. Agent marks task as completed via `task_complete`
2. Review engine checks:
   - Did the agent commit code? (commit_sha exists)
   - Do tests pass? (tests_passed flag)
   - Are acceptance criteria met? (LLM review)
   - Is code context updated? (files_changed matches context)
3. If all pass: move card to "review" or "done"
4. If issues: move back to "doing" with comments

**Implementation:**
- New file: `barkcli-core/src/commands/review.rs`
- Triggered automatically or via `barkcli review <card-id>`

---

## 4. Memory & Context System

### 4.1 The Problem

Currently, barkcli has:
- File-path-based context matching (regex tokens, no semantics)
- Per-session captures (no cross-session learning)
- Per-card AI summaries (only with Pro license + LLM call)
- No embedding or vector search

Agents start fresh each session. They don't remember:
- Past decisions and rationale
- Code patterns in this project
- Developer preferences
- What worked/didn't work before

### 4.2 Proposed Memory Architecture

```
┌─────────────────────────────────────────────┐
│           MEMORY TIERS                       │
│                                              │
│  Tier 1: Working Memory (in-context)         │
│  ├── Current card metadata                   │
│  ├── Current task context files              │
│  ├── Recent session history (last 5)         │
│  └── Active spec requirements                │
│                                              │
│  Tier 2: Short-term Memory (session-level)   │
│  ├── This session's decisions                │
│  ├── Files touched and why                   │
│  ├── Errors encountered and fixes            │
│  └── Intermediate reasoning                  │
│                                              │
│  Tier 3: Long-term Memory (project-level)    │
│  ├── Code patterns (idioms, conventions)     │
│  ├── Architecture decisions + rationale      │
│  ├── Past bug fixes and their root causes    │
│  ├── Developer preferences and style         │
│  └── Cross-card dependency knowledge         │
│                                              │
│  Tier 4: External Memory (searchable)        │
│  ├── All past sessions (embedded)            │
│  ├── All specs and requirements              │
│  ├── Git history with context                │
│  └── Code symbol index                       │
└─────────────────────────────────────────────┘
```

### 4.3 Integration Options (Research-Backed)

Based on research of top open-source tools:

#### Option A: Mem0 Integration (Recommended for MVP)
- **Why:** 64K stars, Apache 2.0, single LLM call extraction, multi-signal retrieval
- **How:** Add `mem0` as a Rust dependency (or call via MCP/HTTP)
- **Memory structure:**
  - User memory: developer preferences, coding style
  - Agent memory: what this agent has learned about the project
  - Session memory: per-session context
  - Card memory: per-card history and decisions
- **Retrieval:** Before each task, query Mem0 for relevant memories

#### Option B: Letta/MemGPT Integration (For advanced memory hierarchy)
- **Why:** 24.5K stars, Apache 2.0, OS-like memory management
- **How:** Agent File (`.af`) format for portable memory
- **Memory structure:**
  - Core memory (always in context): project conventions, active decisions
  - Archival memory (searchable): past sessions, decisions, patterns
  - Recall memory: recent conversation history
- **Retrieval:** Letta manages what's in context vs archived automatically

#### Option C: Native Implementation (No external dependency)
- **Why:** Full control, no Python/Node dependency
- **How:** Implement in Rust using:
  - `fastembed` crate for local embeddings (no API key needed)
  - `tantivy` for full-text search
  - JSON files for structured memory
- **Memory structure:** Same 4 tiers, implemented as `.board/memory/` files
- **Retrieval:** BM25 + cosine similarity on embeddings

**Recommendation:** Start with Option C (native Rust) for the MVP. It avoids external dependencies and keeps barkcli self-contained. Add Mem0 as an optional backend for users who want more sophisticated memory.

### 4.4 Context Optimization

Borrowing from LangChain Deep Agents' three-tier compression:

1. **Observation Masking:** When context exceeds 70% of window, hide older tool outputs
2. **Filesystem Offloading:** Move large histories to `.board/memory/` files, keep pointers
3. **LLM Summarization:** At task boundaries, compress session history into structured summaries

**Implementation in MCP server:**
- Before returning context to agents, check token count
- If over threshold, compress older entries
- Store compressed versions in memory tier 2
- Always keep tier 1 (working memory) uncompressed

---

## 5. Multi-Agent Coordination

### 5.1 Role-Based Task Assignment

The existing role system (`ScrumMaster`, `ProductOwner`, `TechLead`, `ProjectManager`) can be extended:

| Role | Responsibility | Agent Type |
|------|---------------|------------|
| **Intake** | Parse human input → card + spec | LLM (barkcli internal) |
| **Planner** | Spec → task decomposition | LLM (barkcli internal) |
| **TechLead** | Technical decomposition + review | Coding agent (Claude Code) |
| **Developer** | Implement tasks | Coding agent (OpenCode/Claude Code) |
| **Reviewer** | Validate output | LLM (barkcli internal) + human |

### 5.2 Agent Communication

```
Human → barkcli intake → [card + spec created]
                              ↓
                        barkcli plan → [tasks created in queue]
                              ↓
                        barkcli dispatch → [tasks assigned to agents]
                              ↓
                   ┌──────────┼──────────┐
                   ↓          ↓          ↓
              Agent A     Agent B    Agent C
              (feature)   (bugfix)   (refactor)
                   ↓          ↓          ↓
                   └──────────┼──────────┘
                              ↓
                        barkcli review → [validated → done]
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Fix critical bugs, wire existing components

1. Fix HTTP method mismatch in listener (`PUT` → `POST`)
2. Populate `context_files` in task creation (MCP + server)
3. Wire agent state mutations through claim/complete/fail
4. Add file locking for concurrent task queue access
5. Add dependency resolution to `next_pending()`
6. Fix `complete_task_handler` to store results

### Phase 2: Intake & Planning (Week 3-4)
**Goal:** Human input → structured work

1. Implement `barkcli intake` command (LLM-powered classification)
2. Implement `barkcli plan` command (spec + decomposition generation)
3. Enhance decomposition with LLM (not just algorithmic)
4. Create spec-to-task pipeline (specs auto-generate tasks)

### Phase 3: Memory System (Week 5-6)
**Goal:** Cross-session learning

1. Implement native memory system (embeddings + BM25)
2. Add memory tiers (working, short-term, long-term, external)
3. Context optimization (compression at task boundaries)
4. Agent memory: each agent remembers project patterns
5. `barkcli memory` commands (search, add, clear)

### Phase 4: Monitor & Review (Week 7-8)
**Goal:** Human visibility and quality gates

1. Implement `barkcli monitor` (TUI dashboard)
2. Implement `barkcli review` (automated validation)
3. Agent heartbeat system
4. Stuck task detection and auto-reassignment
5. Sprint velocity integration with dispatch decisions

### Phase 5: Listener Realization (Week 9-10)
**Goal:** Listener actually does work

1. Implement real task processing in listener:
   - Read context files
   - Create git branch
   - Invoke coding agent (opencode/claude-code) via subprocess
   - Run tests
   - Commit changes
   - Report results
2. Add listener to TUI management tabs

---

## 7. File Changes Summary

### New Files
```
barkcli-core/src/commands/intake.rs      # Human input processing
barkcli-core/src/commands/plan.rs        # Spec + decomposition generation
barkcli-core/src/commands/monitor.rs     # Status dashboard
barkcli-core/src/commands/review.rs      # Output validation
barkcli-core/src/memory/mod.rs           # Memory system root
barkcli-core/src/memory/embeddings.rs    # Local embedding generation
barkcli-core/src/memory/search.rs        # BM25 + semantic search
barkcli-core/src/memory/tiers.rs         # Memory tier management
```

### Modified Files
```
barkcli-core/src/agent/queue.rs          # Add dependency resolution, context population
barkcli-core/src/agent/decompose.rs      # Add LLM-powered decomposition
barkcli-core/src/agent/orchestrate.rs    # Wire memory, specs, velocity into cycle
barkcli-core/src/mcp.rs                  # Add memory tools, fix task creation
barkcli-core/src/cli.rs                  # Register new commands
barkcli-cli/src/listener.rs              # Real task processing
barkcli-cli/src/main.rs                  # New command dispatch
barkcli-server/src/lib.rs                # Fix HTTP methods, add heartbeat, agent state
```

### Dependencies to Add
```
# Cargo.toml
fastembed = "3.x"         # Local embedding generation (no API key)
tantivy = "0.21"          # Full-text search
```

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Memory system too slow | Medium | High | Use fastembed (ONNX, local) + BM25 fallback |
| LLM decomposition inaccurate | Medium | Medium | Human-in-the-loop review, confidence scores |
| File locking contention | Low | High | Use `fs2` crate for advisory file locks |
| Agent subprocess management | High | Medium | Start with OpenCode (has plugin), add Claude Code later |
| Scope creep | High | High | Strict phase gates, ship Phase 1-2 first |

---

## 9. Success Metrics

- **Intake → Task time:** < 30 seconds from human input to agent-ready task
- **Context relevance:** > 80% of context files provided to agents are actually used
- **Memory hit rate:** > 60% of memory queries return relevant past context
- **Agent utilization:** > 70% of agent time spent on actual coding (not waiting)
- **Review pass rate:** > 80% of completed tasks pass review on first attempt
