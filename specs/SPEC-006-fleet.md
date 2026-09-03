# SPEC-006 — Fleet: multi-agent execution (sessions, worktrees, leases)

**Status:** implemented  
**Branch:** `feat/fleet-multi-agent`  
**Depends:** SPEC-001..005  

## Goal

Spin up N agents across isolated worktrees with sessions, leases, and a
merge gate — `barkcli fleet up --agents 3` delivers parallel work with zero
file collisions and automatic ghost recovery.

## Design rules

1. One task = one worktree = one session = one branch (`bark/<task-id>`).
   Agents never touch the human's `main` checkout.
2. Files are the API: sessions, leases, transcripts live under `.board/`.
3. Spawn is cheap, merge is gated (verify + review before landing).
4. Anything silent gets reaped (heartbeats everywhere).

## What was built

### F1 — Sessions (`agent/session.rs`)
`Session {id, agent_id, task_id, backend, worktree_path, branch, pid,
transcript_path, prompt_path, status, heartbeats, notes}`. Per-session JSON
in `.board/sessions/<id>.json` (JSONL log untouched). Short-id prefix
resolution (`resolve_session_id`). Statuses: Starting/Working/Idle/Done/
Failed/Killed.

### F2 — Worktrees (`agent/worktree.rs`)
`acquire_worktree(slug)` refuses dirty **tracked** trees (untracked files
don't count — worktrees don't inherit them), creates
`.board/worktrees/<slug>` on `bark/<slug>`. `release_worktree` + prune.
`list_worktrees` parses `git worktree list --porcelain`.

### F3 — Backends (`agent/backend.rs`)
`Backend` trait: `detect / command / spawn (detached → transcript)`.
opencode (`--prompt`), claude (`--print`), codex (`exec`), human
(prompt file, no process). `auto_backend()` picks first installed.
`pid_alive` / `kill_pid` (unix).

### F4 — Leases (`agent/queue.rs`)
`TaskLease {agent, session, acquired, expires, heartbeat}` on every claim.
`claim()` idempotent per agent; `heartbeat()` refresh; `release_stale_leases()`
returns tasks to Pending preserving attempts; `Blocked`/`NeedsInput` states
with reasons; progress notes. New `TaskStatus::is_terminal/is_active`
helpers. Server claim endpoint + TUI updated.

### F5 — Dispatcher + reconciler (`agent/fleet.rs`)
`dispatch_scores` (priority − age bonus + overlap penalty),
`overlap()` file-collision report, `spawn_budget = min(max − live, runnable)`,
`FleetReconciler` persisted state, task/agent count rollups.

### P5 — Verify (`agent/verify.rs`)
`.board/verify.json` profile, auto-detect (cargo/npm/pytest/go),
structured step results. `barkcli verify [--init] [--task ID]`
(runs inside task worktree when claimed).

### Agent kit (P0–P3 foundation)
`prime` (<8KB boot context), `ready` (ranked + reasons), `packet`
(enriched task packet), `handoff` (+ `--save`), `task <id>
show|note|block|unblock|heartbeat`. Prompt builder shared with listener
(`agent/prompt.rs` + `skills_for_task`).

## CLI surface

```
barkcli fleet up [--agents N] [--backend NAME] [--once] [--watch]
barkcli fleet down [--hard]
barkcli fleet status | logs <session> | merge <task> | retry
barkcli fleet spawn --agent ID [--backend NAME] [--task TASK]
barkcli fleet list | kill <session> | note <session> <text>
barkcli ready | packet <task> | prime | verify | handoff <task>
barkcli task <id> show|note|block|unblock|heartbeat
```

## MCP surface (+15 tools)

`prime, ready, packet_get, progress_note, task_block, task_unblock,
task_heartbeat, handoff, verify, session_spawn, session_list,
session_logs, session_kill, fleet_status` (+ lease fields on `task_claim`).

## Verification (all live-smoked)

- Scratch repo: init → add → dispatch → `fleet up --agents 1
  --backend human --once` → spawn + claim + worktree + prompt file.
- `fleet status / ready / packet / prime / task note+show / handoff /
  verify --init / fleet kill (short id) / fleet merge` (merge moved card
  to done, removed worktree + branch).
- MCP: `prime / ready / fleet_status` over stdio.
- `cargo test --workspace`: all green (core 99 incl. 13 new fleet tests).

## Deferred (v2)

Fleet exclusion locking (warn-only overlap today), multi-agent
negotiation, live log streaming, cost/budget caps, web fleet views,
`AgentBackend::stream`.
