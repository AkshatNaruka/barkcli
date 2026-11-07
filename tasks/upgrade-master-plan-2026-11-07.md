# Reconciled Upgrade Master Plan — BarkCLI
**Date:** 2026-11-07  
**Status:** approved to start (A1 in progress)  
**Baseline at plan start:** `80afdb5a8c22cef91dad345249598f6fc82ac663` (`master...origin/master [ahead 5]` in main checkout)  
**Inputs:** attached `PLAN.md` (BarkCLI Master Upgrade Plan, 786 lines) reconciled against current repo state and recent upgrades.  
**Guardrails:** `desktop/`+`web/` only (`barkcli-ios/` frozen); local-first/offline default; no mandatory telemetry/cloud/model downloads; no silent plugin/exec/network escalation; no merge on agent claim alone; additive/versioned migrations; preserve boards/specs/memory/context/runs/receipts/skills.lock.

## North star
Supervise multiple coding agents confidently — *correct execution, useful context, evidence ready to ship* (intent → plan → isolated worktree → gates/guard/review → merge).

## Existing plans (do not overwrite)
`tasks/plan.md` + `tasks/todo.md` = completed “Management-Layer Upgrade” (different work). This file tracks the reconciled master upgrade roadmap.

## Reconciliation highlights
- **Already shipped/evolved (verify, don’t assume complete):** event-sourced core (`barkcli-core/src/event_sourced/*`), provider/runtime/thread/inspector upgrades, T3-style thread details (collapsible steps, execution trace in Details), worktree acquisition from `HEAD` with dirty main checkout, AppRail badge cleanup, `bark/create-ping-uptime-endpoint-02047e5e` changes already in `master`.
- **Still requires evidence/hardening per attached PLAN.md:** P0 baseline/contracts/threat/perf; canonical `RunService` conformance + crash-safe reconciliation + idempotency; centralized authz on all sensitive REST/WS/SSE/actions; path/exec/prompt-output hardening; context retriever SPI + worktree-safe evidence + evals; provider/ACP/MCP conformance; reconnect/replay workbench; diagnostics/release/upgrade-rollback.

## Architecture decisions (confirm via ADRs)
- One canonical `RunService`/event schema (CLI/server/MCP/UI), compat-wrap legacy; `ProbeOnlyProvider` never runnable.
- Explicit durable state machine + monotonic event IDs/cursors + idempotent transitions + restart reconciliation.
- Centralized authz (read/operator/maintainer) on every route/stream/action; loopback default; canonical workspace/worktree roots; redaction.
- `ContextEngine` remains compiler/policy owner; native default; optional retrievers (AST/CK/Codanna) only with benchmark+opt-in+fallback.
- Capability-scoped plugins/protocols (child-process/MCP/IPC first), ACP stable-v1 pilot, MCP hardening; no hidden downloads.

## Phased roadmap
| Phase | Outcome | Gate | Depends |
|---|---|---|---|
| A (P0+) | Baseline, contracts, golden fixtures, threat model, perf baseline | Reproducible evidence; offline fixtures; security negative matrix | none |
| B (P1) | Reliable & safe runtime (canonical runs, durability, scheduler, gate/merge SHA integrity, authz, hardening, provider conformance) | Crash/concurrency/security suites green; no dup runs/silent loss/unsafe merge | A |
| C (P2) | Context quality (retriever SPI/evidence, incremental worktree-safe index, optional POC+eval, memory provenance) | Recall/token/task-success targets or documented tradeoff; native fallback | A,B |
| D (P1/P2) | Protocols/extensions (MCP hardening, ACP pilot, capability-scoped registry, Context7 opt-in) | Conformance; escalation rejected; uninstall safe | B,C |
| E (P1 UX) | Live workbench + reconnect/replay + SHA-verified review + safe remote/PWA | 1k+ events interactive; exact reconnect; unauth cannot act | B,D |
| F (P2) | Explainable routing/planning, verified collective memory, local diagnostics, release/upgrade-rollback | Redacted diagnosis; data-preserving upgrades | all |

## Phase A tasks (current)
- [x] **A1 (S) Baseline & toolchain truth** (+ extension) — toolchain/commit captured; core lib tests pass (419/419), targeted `product_plan` passes here; `cargo fmt`/core clippy fail (debt); web deps installed, build passes, web tests baseline has 2 failures (captured). `docs/engineering/BASELINE.md` updated. Full workspace/CI matrix deferred. *Deps:* none.
- [x] **A2 (S) Contract inventory & drift** — extracted 97 MCP tools (drift: mcp header 80, README 76), 171 unique API paths + `/ws`/thread stream, provider capabilities, run entrypoint map. `docs/engineering/CONTRACT_INVENTORY.md`. Full schema snapshots/CI enforcement deferred. *Deps:* A1.
- [x] **A3 (M, foundation)** — golden fixture catalog (`docs/engineering/GOLDEN_FIXTURES.md`) mapping PLAN scenarios to existing tests (`runner_loop`, `runtime_run`, `stress_concurrent`); gaps marked (kill/restart reconciliation blocked by B2; paraphrase eval for A5/C). Added characterizing test `context::pack::tests::a3_fixture_paraphrase_query_compiles_and_records_recall` (offline, passes). *Deps:* A1.
- [x] **A4 (M, foundation)** — `docs/security/THREAT_MODEL.md` with trust boundaries, assets, sensitive surfaces, prioritized threats (T1–T10), and negative test matrix (N1–N15) mapped to existing server auth tests and B4/B5/B6/P3 gaps. *Deps:* A1.
- [x] **A5 (M, scoped)** — first-party context benchmark captured (`docs/engineering/context-benchmark-a5.json`, cold 34970 / warm 824 proxy tokens, methodology noted); build/test timings and web bundle warnings recorded in `docs/engineering/PERF_BASELINE.md`. Full profiling matrix (index/stream/UI/memory/disk/OS/provider-actual) deferred to C/E. *Deps:* A1.

## Checkpoint A
- [x] A1–A5 foundation evidence committed on `plan/upgrade-a1-baseline` (baseline/contracts/fixtures catalog+char test/threat model/perf baseline). Remaining hardening: full workspace/CI matrix, MCP/route schema snapshots, restart/reconcile fixtures (B2), complete negative/security tests (B4–B6), eval harness (A5/C).

## Phase B (in progress)
- [~] **B1 Canonical `RunService`/lifecycle (P0,L)** — B1.1 call graph, B1.2 schema mapping, B1.3 probe-only conformance, B1.4a server dual-path audit (`RunService` + `run_cmd::run` + `dispatch_backend_plan`) documented. Next: B1.4 server handler unification via canonical launcher/facade, B1.5 CLI compat wrap, full parity/dup-launch/capability gating. *Deps:* A2,A3.
- [~] **B5 Centralized authz (P0,L)** — B5.1 N5/N6, B5.2 N7 + `AUTHZ_MATRIX.md`, B5.3 classifier/tests, B5.4 auth-layer negative tests on representative high-risk surfaces (`/api/exec`, repo, git push) pass. Next: real handler policy (exec/cwd/path confinement, B6), WS upgrade/action authz (N9), scoped tokens/roles, full route registry enforcement. *Deps:* A4.
- [ ] **B2 Durable state/reconciliation (P0,L)** — *Deps:* A3,B1.
- [~] **B4 Gate/guard/merge SHA integrity (P0,M)** — B4.1 audit: `RunService::merge` has strong controls (explicit approval, merge-train lock, `GateSummary::verified` + `CheckVerification`, tested/target head binding, run head/dirty checks, recheck HEAD). Gaps: caller-bound approval not SHA-attested in API, server handler parity, request-changes/approval state, untracked policy, concurrent race tests. `docs/engineering/GATE_MERGE_INTEGRITY_B4.md`. *Deps:* A4,B2 (partial progress now).
- [~] **B6 Path/exec/prompt-output hardening (P0,M)** — B6.1 core repo path traversal/symlink escape tests pass (`safe_join`/`read_file`). Next: HTTP repo/file negative tests, exec policy/cwd/allowlist/audit, prompt-output secret redaction boundaries. *Deps:* A4,B5.
- [ ] **B3 Scheduler/worktree discipline (P0,M)**, **B7 Provider conformance (P1,M)**.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Dual run paths | High | Call-graph, compat wrappers, conformance fixtures |
| Security regression (`exec`/git/file/streams) | High | Negative tests per surface, centralized authz |
| Optional integrations bloat/leak | Med/High | Native default+fallback, opt-in, benchmark gate |
| UI/event reconnect/approval races | Med | Monotonic cursors, dedupe/gap, SHA/revision guards |

## PR contract (every task)
One backlog item/PR; fresh branch/worktree; failing tests first where applicable; exact command results (skipped ≠ passed); compat/migration/cost/rollback/docs noted.

---
## Autonomous execution log (2026-11-07, session continuation)
**Principle:** deliver every phase in priority order as feasible increments — implemented+tested where safe, otherwise committed design/ADR/scaffold/tests with explicit blockers. No destructive changes, no hidden network/model downloads, no merge without gates.

### Additional commits
- `d8b555c` web(hygiene): fixed `ThreadPane` details activity assertion contract (baseline web test now passes for that case).
- `4459b0b` server(B4.2): optional SHA-attested `expected_head_sha` for merge/approve (backward-compatible); core merge remains authoritative.

### Phase status snapshot (after continuation)
- **A:** complete as scoped foundation (A1–A5 evidence committed).
- **B:** B1.1–B1.4a, B3 probe conformance (scoped), B4.1/B4.2 partial, B5.1–B5.4 + classifier/matrix, B6.1 core path tests done. Remaining behavior work (B1.4/B1.5 unification, B2 durability+restart fixtures, full B4 state machine/invalidation/races, B5 WS/action enforcement/scoped tokens, B6 exec policy/prompt redaction/HTTP path tests, B7 wrappers) requires careful refactors and is scaffolded below.
- **C–F:** designs/scaffolds/contracts/eval plans committed below; external POCs (CK/Codanna), browser/E2E, OS matrix, rmcp/ACP migration, and production release validation remain blocked on environment/tooling decisions and multi-PR implementation.

### Known blockers (not silently skipped)
- **Full B1/B2 behavior unification:** touches `run_cmd`, server `dispatch_backend_plan`/thread flows, runtime IDs/events, merge-train semantics; needs integration+compat tests and likely multi-PR rollout.
- **Crash/restart fault injection (A3 gap #4, B2):** needs deterministic kill/restart harness around persisted run state and runner processes.
- **N9 WS per-message authz / exec handler policy enforcement:** `exec_handler` runs `sh -lc` in project root; adding allowlist/cwd confinement/audit is breaking-risk and needs product decision (local trusted vs remote-capable). WS upgrade covered by path protection; message-level authz needs protocol audit.
- **C2 CK/Codanna POCs:** require optional external binaries/models; must remain opt-in, benchmarked with `context-benchmark-a5.json` methodology, no default network/model downloads.
- **D3 rmcp/ACP migration:** evaluate compatibility; do not force SDK migration without parity/snapshot tests.
- **E1/E4:** live browser workbench state model, reconnect/cursor protocol, PWA/safe remote desktop need UI/state refactors + Playwright/manual validation.
- **F1/F4/F5:** model-backed evals, OS/desktop matrix, CI release/rollback require infra and release engineering.

### Acceptance discipline
- Targeted tests added/passed are cited in commits/docs; full-suite debt (`cargo fmt` tui drift, clippy debt, web baseline noted) not claimed fixed unless committed.
- Runtime-sensitive changes kept additive/backward-compatible; design-first for risky areas.
