# Contract Inventory & Drift (A2)

**Date:** 2026-11-07  
**Baseline commit:** `80afdb5` (branch `plan/upgrade-a1-baseline`)  
**Method:** static extraction from source (`barkcli-core/src/mcp.rs`, `barkcli-server/src/lib.rs`, `barkcli-core/src/runtime/provider.rs`, CLI/runtime entrypoints) + doc grep. **Not** a runtime conformance test. Counts may change if registration patterns change.

## 1. MCP (Model Context Protocol)

| Item | Observed | Source |
|---|---:|---|
| Tool definitions (name+description pattern) | **97** | `barkcli-core/src/mcp.rs` (`{"name":"...","description"}` objects) |
| File header claim | **80** | `mcp.rs` module doc: “Available Tools (80)” |
| README claims | **76** | `README.md` lines ~72,345 (and related text) |
| Transport/handlers | `tools/list`, `tools/call` | `mcp.rs` request dispatch |

**Drift (actionable):** tool count is inconsistent (97 registered by extraction vs 80 header vs 76 README). Generate authoritative inventory from runtime registration or a single source-of-truth list; update docs/header in the same PR (A2 follow-up/BARK-002 style). Add contract snapshot tests to prevent drift.

**MCP tool names (97, extracted):** `board_list, board_get, board_create, card_list, card_get, card_create, card_update, card_move, card_comment, task_list, task_get, task_create, task_claim, task_complete, task_fail, agent_register, agent_status, agent_list, context_scan, context_get, context_file_get, context_digest, code_search, callgraph_get, metrics_get, sprint_list, sprint_start, sprint_end, orchestrate_next, orchestrate_cycle, memory_add, memory_search, memory_list, memory_brief, brain_graph, brain_neighbors, agent_heartbeat, mind_snapshot, overview, skill_list, skill_get, intake, prime, ready, packet_get, progress_note, task_block, task_unblock, task_heartbeat, handoff, verify, guard_scan, receipt_list, receipt_get, receipt_verify, review_queue, milestone_list, milestone_create, milestone_assign, milestone_ship, milestone_roadmap, merge_train_plan, merge_train_run, merge_train_status, gate_check, worktree_list, worktree_checkpoint, agent_loop_tools, agent_loop_status, health, session_spawn, session_list, session_logs, session_kill, fleet_status, autopilot_status, autopilot_propose, autopilot_approve, autopilot_reject, packet_claim, history_scan, bundle_list, bundle_get, bundle_propose, bundle_approve, bundle_reject, bundle_merge, bundle_split, bundle_move_commit, bundle_seal, contribution_analysis, contribution_add, contribution_link, contribution_verify, rules_list, rules_get, rules_add`.

**Security note (for A4):** MCP tools are execution/control surfaces — each must pass normal permission checks; no bypass via protocol.

## 2. HTTP API (Axum server)

| Item | Observed | Source |
|---|---:|---|
| `.route(...)` calls | **197** | `barkcli-server/src/lib.rs` |
| Unique route paths | **171** | extracted `.route("...")` paths |
| WebSocket | `/ws` | server routes |
| Thread stream | `/api/threads/{id}/stream` | server routes |

**High-impact/sensitive surfaces (prioritize in A4/B5/B6):** `/api/exec`, `/api/open`, `/api/repo/file`, `/api/repo/tree`, `/api/git/*` (assign/commit/commits/diff/merge/pr/push/status/worktrees), hooks install, import/export, project init/onboard, run/session/task mutation and merge/approve/stop/steer/fork/gate/verify operations, all WS/SSE streams. **Every** route/stream/action needs explicit authz scope + negative tests.

**Unique route paths (171):** see extraction in this report’s source run; key groups include project/board/cards/threads/runs/sessions/tasks/providers/context/code/git/merge-trains/milestones/worktrees/receipts/review/guard/memory/brain/skills/rules/bundles/history/usage/health/ping/ws. (Full list preserved via `python3` extraction during A2; regenerate in CI for canonical snapshot.)

## 3. Provider/runtime capabilities

**`ProviderCapabilities`** (`barkcli-core/src/runtime/provider.rs`): `resume, stream_json, tool_events, approvals, questions, fork, usage, skills, mcp, headless` (all default false).

**`ProviderStatus`** includes: `id,name,available,version,command,detail,authenticated,auth_command,auth_hint,capabilities`. `authenticated: None` = unknown (not “ready”).

**Adapter contract:** `ProviderAdapter` (`probe/capabilities/start/models`), `RunHandle` (`run_id/pid/send/steer/interrupt`). `ProbeOnlyProvider` exists — **must never be advertised as runnable** (B1/P1-01).

## 4. Run/execution entrypoints (canonicalization map for B1)

| Entrypoint | Location | Role/risk |
|---|---|---|
| `cli::run` / `run_dispatch` | `barkcli-core/src/cli.rs` | top-level CLI dispatch |
| `run_cli` / `run` | `barkcli-core/src/commands/run_cmd.rs` | command-based run path |
| `RunService` | `barkcli-core/src/runtime/runner.rs` | runtime service (candidate canonical owner) |
| `ProviderAdapter` / registry | `barkcli-core/src/runtime/provider.rs` | normalized provider contract/events |
| `agent::backend` (command-based `Backend`) | `barkcli-core/src/agent/backend.rs` | legacy/parallel path; reconcile/wrap |

**Drift/risk:** multiple execution paths (legacy `agent/backend` + runtime provider/runner + `run_cmd`) — confirms PLAN.md P1-01/B1. Build call graph, unify under canonical `RunService`/event schema with compat adapters; prove CLI/web equivalence and no duplicate agents (A3 fixtures + B1 tests).

## 5. UI/feature status (initial)
- **Live backend-backed:** threads/runs/providers/board surfaces exist in server+web (verify per feature in A2 deepening).
- **Demo/partial/missing:** not fully enumerated in A2; requires feature-by-feature matrix (A2 extension) including mobile/PWA readiness and auth UX truthfulness.

## 6. Recommended follow-ups
1. **Single-source MCP inventory:** generate tool list/schemas at build/test time; update `mcp.rs` header + README; add snapshot test (non-brittle).
2. **Route contract snapshot:** export method+path+auth-scope metadata; fail CI on undocumented sensitive route.
3. **Entrypoint call graph (B1 prerequisite):** map all callers of `run_cmd`, `agent::backend`, `runtime::runner/provider`, server run/session routes.
4. **A4 input:** treat all `/api/exec|open|repo/*|git/*|ws|streams|mutations` as deny-by-default until scoped authz proven.
5. **A2 extension:** enumerate WS/SSE message schemas and MCP `inputSchema` snapshots; produce `audit/contracts.json` (redacted).
