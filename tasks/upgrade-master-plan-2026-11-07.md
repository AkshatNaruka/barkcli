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
- [~] **A1 (S) Baseline & toolchain truth** — pin commit/toolchain; run supported checks (fmt/test/clippy/web test+build as feasible); capture pass/fail/skip/flakes; triage `agent::product_plan::tests::from_card_creates_verification_dependency`. *Accept:* `docs/engineering/BASELINE.md` + raw results; skipped ≠ passed. *Deps:* none.
- [ ] **A2 (S) Contract inventory & drift** — MCP tools/schemas, REST/WS/SSE, provider capabilities, run entrypoints vs docs.
- [ ] **A3 (M) Golden offline fixtures** — disposable repos; pass/fail-gate/conflict/kill-restart/resume-stop-review/paraphrase context; fake providers.
- [ ] **A4 (M) Threat model & negative tests** — sensitive surfaces, trust boundaries, authz matrix.
- [ ] **A5 (M) Perf/context baselines** — context/symbol/memory/search/stream/UI; footprint/latency scripts.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Dual run paths | High | Call-graph, compat wrappers, conformance fixtures |
| Security regression (`exec`/git/file/streams) | High | Negative tests per surface, centralized authz |
| Optional integrations bloat/leak | Med/High | Native default+fallback, opt-in, benchmark gate |
| UI/event reconnect/approval races | Med | Monotonic cursors, dedupe/gap, SHA/revision guards |

## PR contract (every task)
One backlog item/PR; fresh branch/worktree; failing tests first where applicable; exact command results (skipped ≠ passed); compat/migration/cost/rollback/docs noted.
