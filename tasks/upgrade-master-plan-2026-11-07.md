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

## Phase A — complete (scoped)
- [x] **A1–A5:** `BASELINE.md`, `CONTRACT_INVENTORY.md`, `GOLDEN_FIXTURES.md` (+ A3 test), `THREAT_MODEL.md`/`AUTHZ_MATRIX.md`, `PERF_BASELINE.md` + `context-benchmark-a5.json`. Checkpoint evidence committed.

## Phase B — runtime correctness (P0 priority, partially implemented + designed)
- [~] **B1** `RunService`/lifecycle — B1.1–B1.4a docs/tests/audit, `ADR-B1-canonical-run-launcher.md`. *Blocked:* full server/CLI/MCP launcher unification/compat adapters.
- [~] **B2** Durability/reconciliation — `ADR-B2-durable-runtime-state-machine.md`. *Blocked:* state-machine refactor + kill/restart harness.
- [~] **B3** Capability-aware providers — capability map + probe-only non-runnable test. *Remaining:* launcher/MCP gating.
- [~] **B4** Gate/guard/merge SHA integrity — B4.1 audit + B4.2 SHA-attested merge/approve API (additive). *Remaining:* approval invalidation/races/CLI parity/untracked policy.
- [~] **B5** Centralized authz — N5–N7/N9/N10 tests, matrix, `route_scope` classifier. *Remaining:* scoped tokens, WS/action authz, route registry enforcement, remote defaults.
- [~] **B6** Path/exec/prompt-output hardening — B6.1 core path tests, `EXEC_POLICY_B6.md`. *Remaining:* HTTP path tests, exec policy/cwd/allowlist/audit, redaction.
- [~] **B7** OpenAI-compatible wrapper — `WRAPPER_STUBS_B7.md` (reference). *Blocked:* impl + security review.

## Phase C–F — designed/scaffolded (implementation/POCs blocked by deps/infra as noted)
- [~] **C1–C4:** `CONTEXT_RETRIEVER_SPI_C1.md` + additive `retriever_spi` module/test; CK/Codanna POCs/evals opt-in/external-dep blocked.
- [~] **D1–D5:** `MCP_ACP_EXTENSIONS_D.md` (97-tool inventory known; schemas/snapshots/conformance/ACP-rmcp evaluation/extensions hardening follow-ups).
- [~] **E1–E4:** `LIVE_WORKBENCH_RECONNECT_E.md` (state model, reconnect/cursor, PWA/safe remote) — UI/protocol/E2E follow-ups.
- [~] **F1–F5:** `EVALS_OBSERVABILITY_RELEASE_F.md` + `RELEASE_CHECKLIST_F4.md` (eval harness, routing memory, redacted observability, CI/release/upgrade/rollback, support matrix).

## Done criteria (this execution)
- [x] Phases planned in priority order; branch/worktree used; commits per increment.
- [x] A foundation evidence complete and committed.
- [x] P0 security/integrity increments implemented where safe (N5–N7/N9/N10, core N12, B4.2 SHA attestation, route scope classifier, C1 SPI scaffold) with targeted tests.
- [x] Remaining B–F items have concrete ADRs/designs/scaffolds/checklists and explicit blockers — no silent omission.
- [ ] Full runtime unification, crash harness, external POCs, full conformance/CI matrix, UI reconnect/workbench, and release infra require multi-PR/infra work (tracked above).

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
