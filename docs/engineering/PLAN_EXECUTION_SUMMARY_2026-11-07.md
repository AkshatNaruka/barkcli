# Master Plan Execution Summary (2026-11-07)

**Branch:** `plan/upgrade-a1-baseline` (worktree: `.board/worktrees/upgrade-a1-baseline`, base `80afdb5`/`master`)  
**Scope:** BarkCLI `desktop/`+`web/`+`barkcli-core`+`barkcli-server`+`barkcli-cli` (no `barkcli-ios/`).

## What was implemented (evidence-backed)
| Area | Deliverable | Evidence |
|---|---|---|
| A1–A5 | Baseline, contracts (97 MCP, 171 API paths + streams), golden fixtures + A3 test, threat model N1–N15 + authz matrix, deterministic context benchmark (cold 34970 / warm 824 proxy tokens) | `docs/engineering/*`, `docs/security/*`, `context-benchmark-a5.json` |
| B1 | Run lifecycle call graph, `run_cmd`↔runtime schema mapping, server dual-path audit, `ProbeOnlyProvider` cannot start runs | `RUN_LIFECYCLE_B1.md`, `runtime::providers::tests::probe_only_provider_cannot_start_runs` **pass** |
| B4 | Gate/merge SHA integrity audit; server merge/approve accept optional `expected_head_sha` (backward-compatible, stale intent rejected early); core merge remains authoritative with proof/head/dirty checks | `GATE_MERGE_INTEGRITY_B4.md`, `barkcli-server` compiles |
| B5 | Auth-layer negative tests: invalid/valid bearer (N5/N6), transitional query token (N7), N10-style exec/repo/git sensitive surfaces, WS path auth (N9). `AuthScope/route_scope()` classifier + tests (no global enforcement change) | `cargo test -p barkcli-server --lib sensitive protected_route route_scope` **pass** |
| B6 | Core repo path traversal + symlink-escape negative tests (N12 core) | `repo::tests::repo_paths_*` **pass** |
| C1 | Additive `ContextRetriever` SPI/types module + test (native descriptor has no network/model download requirement) | `context::retriever_spi` **pass** |
| Hygiene | Fixed `ThreadPane` details activity assertion contract | `web` ThreadPane test **12/12 pass** |

## Designs/scaffolds/checklists committed (all remaining phases covered)
- **B1/B2:** `docs/adr/ADR-B1-canonical-run-launcher.md`, `ADR-B2-durable-runtime-state-machine.md`
- **B5/B6/B7:** `AUTHZ_MATRIX.md`, `EXEC_POLICY_B6.md`, `WRAPPER_STUBS_B7.md`
- **C:** `CONTEXT_RETRIEVER_SPI_C1.md` (+ code scaffold)
- **D:** `MCP_ACP_EXTENSIONS_D.md` (schemas/snapshots, conformance, ACP/rmcp evaluation, extension hardening)
- **E:** `LIVE_WORKBENCH_RECONNECT_E.md` (workbench state, reconnect/cursor, safe remote/PWA)
- **F:** `EVALS_OBSERVABILITY_RELEASE_F.md`, `RELEASE_CHECKLIST_F4.md`
- **Roadmap:** `tasks/upgrade-master-plan-2026-11-07.md` updated with per-phase status and blockers.

## Explicit blockers (not silently skipped)
- **B1/B2 full unification:** server/CLI/MCP launcher migration, compat adapters, dup-launch/parity tests, kill/restart crash harness — multi-PR behavior refactor.
- **B4 remaining:** approval invalidation on request-changes/branch move, CLI/server parity, untracked-file policy decision, concurrent race/fault tests.
- **B5/B6 remaining:** scoped tokens/roles, WS message/action authz, route-registry enforcement, HTTP repo negative tests, exec policy enforcement (product decision: local trusted vs strict/remote), prompt-output redaction.
- **C2/C3:** optional CK/Codanna POCs require external binaries/indexes; must stay opt-in, no default network/model downloads.
- **D3/D4/D5:** ACP/rmcp compatibility evaluation + ADR; extension permissions/lifecycle/isolation implementation.
- **E1–E4:** live workbench UI/state refactor, reconnect cursor protocol, disconnect/reconnect E2E, PWA/safe remote security review.
- **F:** deterministic eval runner/fixtures in CI, routing outcome store, redacted diagnostics bundle, hosted CI/OS/Tauri/signing infra, release/upgrade/rollback execution.

## Safety/guardrails honored
- No `barkcli-ios/` changes. Local-first, no hidden telemetry/model downloads. Changes additive/backward-compatible where feasible; risky behavior changes documented as ADRs/blockers. Skipped tests not treated as passed. Existing `cargo fmt` (TUI) and clippy debt not claimed fixed.

## Suggested next PR slices
1. **Security slice:** exec policy config+audit (strict mode opt-in) + HTTP repo/path negative tests + WS action authz design/tests.
2. **Runtime slice:** `RunLauncher` facade + migrate one server path (thread plan-and-run) with parity tests.
3. **Durability slice:** run state machine enum/transitions + idempotency keys + reconciliation scan; add crash fixture harness.
4. **MCP slice:** schema snapshot generator + conformance tests for read/safe tools.
5. **Context slice:** wire native retrieval behind `retriever_spi` pipeline; then opt-in CK/Codanna adapters.
