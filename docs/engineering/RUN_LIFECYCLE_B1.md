# B1.1 — Run/Execution Call Graph & Canonical Lifecycle Design Note

**Date:** 2026-11-07  
**Status:** design/audit increment (no behavior change). Implements the first step of PLAN B1 / P1-01.  
**Sources:** `barkcli-core/src/cli.rs`, `commands/run_cmd.rs`, `runtime/runner.rs`, `runtime/provider.rs`, `agent/backend.rs`, `barkcli-server/src/lib.rs`, `barkcli-core/src/mcp.rs`, A2 inventory.

## 1. Observed execution entrypoints (parallel paths)

| Path | Key types/functions | Notes |
|---|---|---|
| CLI autonomy loop | `cli::run`/`run_dispatch` → `commands::run_cmd::{run_cli, run, RunOptions, RunReport, TaskOutcome, GateResult}` | Command-based orchestration; supports `BARKCLI_AGENT_CMD` override, `--backend`, parallel `max_agents`, gate/test cmd, merge-train behavior in run flow. |
| Runtime service (M1 vertical slice) | `runtime::runner::RunService::{from_project, with_runtime, start_for_card, diff, merge, merge_eligibility, check, stop, verify}`; `CreateRunRequest`, `RunDiff`, `MergeOutcome` | Uses `RuntimeService/RuntimeStore` + `ProviderRegistry/ProviderAdapter`. Server already constructs `RunService` for run operations. |
| Provider contract | `runtime::provider::{ProviderAdapter, RunHandle, ProviderCapabilities, ProviderStatus, ProviderRegistry, FakeProvider, ProbeOnlyProvider}`; events via `runtime::event::*` | Normalized capabilities/events. `ProbeOnlyProvider` exists — **must never be advertised runnable**. `authenticated: None` = unknown. |
| Legacy/session backend | `agent::backend` (`Backend`/session backend parsing, `pid_alive`) | Server imports `agent::backend::pid_alive`; `dispatch_backend_plan` parses `SessionBackend` and uses `run_cmd::RunOptions.backend`. Compatibility-sensitive. |
| Server HTTP/threads | `barkcli-server` handlers call `runtime::RunService::from_project` for runs; thread/chat/plan-and-run flows dispatch backend plans and run options; `/api/runs/*`, `/api/tasks/*/race`, `/api/threads/*/chat*`, `/api/sessions/*` are execution-adjacent | Multiple surfaces can trigger work; IDs/status/events must be consistent (B1). |
| MCP | Session/fleet/autopilot/merge-train/gate/verify tools exist (`session_spawn`, `merge_train_run`, `gate_check`, `verify`, etc.); no simple `run` tool name found in extraction but execution is reachable via related tools/CLI flows | Must enforce same permissions and lifecycle contracts as server/CLI (B5/P3). |

## 2. Risks confirmed (B1 targets)
- **Dual/overlapping paths:** `run_cmd` + `agent::backend` and `runtime::runner/provider` can diverge on IDs, statuses, events, receipts, merge approval semantics, and duplicate-launch prevention.
- **Capability truthfulness:** UI/MCP/server must disable unsupported operations (resume/fork/steer/approvals/questions/usage/headless) based on negotiated provider capabilities; probe-only/unknown-auth states must not appear runnable.
- **Approval/merge binding:** merge/approval must target exact diff SHA/revision (see runtime tests’ expectation and B4). `RunService::merge` takes `approved: bool` — B4 must bind approval evidence to revision.
- **Server execution surfaces:** thread “plan-and-run”/dispatch paths can spawn work; central run lifecycle should own isolation/worktree/gate/receipt/merge evidence.

## 3. Canonical B1 target (design)
**Single entry point:** `RunService` (runtime) as canonical lifecycle owner, exposed consistently to CLI, server, MCP, and any agent-loop integration.

**Canonical operations (proposed contract):** `create/start`, `send_input`, `steer`, `request_approval`/`resolve_approval`, `stop/interrupt`, `wait/status`, `check_gate/verify`, `diff/context`, `review_ready`, `merge` (authorized, SHA-bound), `resume/fork` only when capability-supported.

**Canonical records/events:** stable `run_id`, `thread_id`/card/task binding, `provider_id`, `worktree_id`/path, branch, attempt/lease, monotonic event `seq`, timestamps, normalized `RuntimeEvent` kinds, gate/guard/review/receipt refs, terminal outcome (`completed/failed/cancelled/interrupted/orphaned/blocked/review_ready/merged` — map to existing `RunStatus` before migration).

**Compatibility:** keep public CLI flags/behavior and existing tool names where feasible. Wrap `run_cmd` and `agent::backend` callers through adapters; do not delete legacy paths until fixture parity (A3) + B1/B7 conformance pass.

## 4. B1 increments
1. **B1.1 (done):** call graph + design note.
2. **B1.2 (done):** schema/field mapping.
3. **B1.3 (done, scoped):** characterizing conformance test `runtime::providers::tests::probe_only_provider_cannot_start_runs` verifies probe-only adapters fail `start()` and do not claim headless — **passes**. Remaining: full lifecycle parity (CLI↔runtime↔server), duplicate-launch prevention, unsupported-op typed errors across all surfaces.
4. **B1.4:** route server run-triggering handlers through canonical service where missing; unify IDs/status serialization.
5. **B1.5:** compat-wrap or migrate CLI `run_cmd` path; preserve `BARKCLI_AGENT_CMD`, `--backend`, parallel/merge-train semantics with tests.

## 6. B1.2 — Field/schema mapping (lossy translation audit)

### `run_cmd` → runtime (conceptual)
| `commands::run_cmd` | `runtime::event` / runner | Mapping / gap |
|---|---|---|
| `RunOptions` (intent, card_id, board, backend, yes/offline/force/no_spec, test_cmd, max_minutes/idle_minutes/max_attempts/max_agents, dry_run/json) | `CreateRunRequest`/start inputs + runtime config | Different shapes; `run_cmd` owns autonomy-loop policy (parallel workers, retries, idle/max time). Canonical service must represent **attempts**, **leases**, **policy** and **backend/provider selection** explicitly or via typed options. |
| `GateResult { cmd, ok, skipped, tail, duration_ms }` | `GateSummary { passed, command, summary, log_path, finished_at, verification: Option<CheckVerification> }` | **Lossy in both directions:** runtime carries stronger proof (`CheckOutcome`, `tested_head/target_head`, `exit_code`, `GateSummary::verified()` requires command+proof). `run_cmd` lacks SHA binding and verification state; `skipped`/duration/tail need normalized fields. B4 requires SHA-bound, non-legacy-only verification. |
| `TaskOutcome.status` = `completed \| ready-unmerged \| failed \| queued` | `RunStatus` = `Queued/Starting/Running/Waiting/NeedsReview/Passed/NotVerified/Failed/Interrupted/Cancelled/Merged` | **Lossy/ambiguous:** `ready-unmerged` ≈ `Passed/NeedsReview` before merge; `completed` conflates gate pass and merge in some flows. Canonical schema must separate *gate verdict*, *review state*, and *merge state*. |
| `TaskOutcome { merged, attempts, transcript, note }` | `RunRecord` (worktree/branch/provider/model/diff_stats/usage/files_touched/gate/events context refs) | Runtime record is richer (evidence). `run_cmd` is report-oriented; needs stable run/attempt IDs and event refs for parity. |
| `RunReport { backend_used, completed/failed/queued, duration, parallel, workers_peak, merged_branches }` | runtime store/list + merge-train/train state | Aggregate metrics exist in different places; canonical run stream should make these derivable from events/records. |

### Required schema decisions (ADRs/B1/B2)
- **Versioning:** add explicit schema/version fields to persisted run/event records and compat readers (serde defaults already used in places).
- **Identity:** every attempt has `run_id`; retries create new runs linked by parent/attempt; task/card/thread linkage consistent across CLI/server/MCP.
- **Gate proof:** no merge on boolean-only legacy gate; require `CheckVerification`/SHA binding (B4).
- **Status mapping:** define deterministic `run_cmd` ↔ `RunStatus` mapping table and keep it tested; never infer merge from “completed”.
- **Provider/capability fields:** preserve raw payload for unknown event versions; surface typed unsupported-capability errors.

## 5. Acceptance evidence required before B1 closes
- Call graph has no un-audited execution launcher.
- CLI and web/server fixture run produce equivalent terminal outcomes, receipts, and no duplicate agents (A3 fixtures extended as needed).
- Unsupported capabilities disabled with typed errors; `ProbeOnlyProvider` never runnable.
- Merge/approval cannot target changed SHA (coordinate with B4).
- `cargo test`/targeted runtime+server tests pass; docs updated.

## 7. B1.4a — Server execution path audit (2026-11-07)
`barkcli-server/src/lib.rs` currently mixes paths:
- **Canonical runtime service (`RunService::from_project` / `start_for_card` / `check` / merge/verify flows):** run lifecycle handlers, task race start path, card plan-and-run paths (lines observed: 1475, 5921, 6005/6008, 6032, 6046, 6082, 6192, 6233, 6422/6425, 6489/6492, 7345, 7965/7966).
- **Legacy/command path (`commands::run_cmd::RunOptions/run`):** thread chat/start flow builds `RunOptions` and calls `commands::run_cmd::run` (4593/4599).
- **Backend plan dispatcher (`dispatch_backend_plan`):** used by thread/plan flows and race spawns (4535, 4652, 4707, 4736, 8313). May create sessions/tasks/runs outside a single normalized server contract.

**B1.4 next:** route thread/plan-and-run/race launches through canonical `RunService` (or a single `RunLauncher` facade) with consistent IDs/status/events/capability checks; keep `BARKCLI_AGENT_CMD`/backend semantics; add integration tests for server-triggered runs. Coordinate with B5 (authz on exec surfaces) and B4 (merge SHA).