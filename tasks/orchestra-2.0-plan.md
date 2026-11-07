# BarkCLI Orchestra 2.0 — Implementation Plan

**Source:** `orchestra.md` (saved 2026-11-07)  
**Status:** Proposed — awaiting approval before implementation (brainstorming HARD-GATE: architectural).  
**Repo state:** `master` @ `459ff07` after upgrade foundation merge; `desktop/`+`web/` active, `barkcli-ios/` frozen.  
**Relevant existing code:** `barkcli-core/src/runtime/{provider,providers,runner,store,event}.rs`, `barkcli-core/src/agent/{team,product_plan,orchestra_service,fleet}.rs`, `barkcli-core/src/ai/provider.rs`, `barkcli-server` run/thread APIs.

## Classification
**Architectural.** Introduces model-intelligence, task-aware routing, dynamic role/model assignment, OpenCode server/session orchestration integration, recovery/handoff, and new UI surfaces. Must preserve existing run/gate/merge/authz behavior and be incremental/compat-safe.

## Guiding decisions (from orchestra.md, adapted to BarkCLI)
- Separate **runtime / inference provider / model / agent role / worker**.
- BarkCLI owns selection/orchestration intelligence; runtimes (OpenCode-first) provide execution.
- **No fake availability, no surprise paid models, no fake independence, no uncontrolled spawning, no unsafe default approvals, no self-reported verification, no silent model switching.**
- Deterministic Rust for scheduling/deps/budgets/liveness/schema/test validation; models for judgment.
- Persist: Git-friendly config for roles/policies/specs; rebuildable local runtime store for sessions/leases/metrics/projections; repo-backed receipts/verified decisions.

## Existing foundations to reuse (do not duplicate)
- `RunService`/runtime events/receipts/gates, `ProviderCapabilities`, provider adapters, thread/run server APIs, worktree discipline, security hardening from upgrade plan.
- `AgentProfile`/team, product planning, orchestra service, fleet capacity/file overlap — extend with dynamic model-policy layer, not wholesale replacement in Phase 1.

## Phased roadmap (incremental, testable, commit per phase/task)

### Phase 1 — Model identity + OpenCode discovery foundation (P0)
**Goal:** normalized model inventory; OpenCode-first discovery; availability states; no behavior change to existing run paths.
- [ ] **O1.1** Add `barkcli-core/src/models/{mod,catalog,discovery,capabilities,health}.rs` (or `runtime/models/*`) with `ModelRef`, `ModelCapabilities`, `ModelAvailability`, `CatalogEntry`, source/confidence/last_checked.
- [ ] **O1.2** OpenCode discovery adapter: prefer structured server/API info when available; fallback `opencode models` / `--verbose` parsing; never auto-probe paid/free models by default.
- [ ] **O1.3** Cache + refresh policy; explicit states (Discovered/Configured/Ready/Unverified/RateLimited/QuotaExhausted/AuthRequired/Unsupported/Offline/Disabled).
- [ ] **O1.4** Compatibility shim: keep current `AgentRuntime::model_ids()`/provider behavior working; map new catalog into existing consumers where safe.
- [ ] **O1.5** Tests: parsing/normalization, state transitions, no-probe-by-default, fixture-based discovery (offline), compat for existing provider tests.

### Phase 2 — Dynamic role/model policy layer (P0)
- [ ] **O2.1** Extend `AgentProfile`/team config with optional `model_policy` (strategy, allowed runtimes/providers, require caps, allow paid/free/local, pin, min confidence) — backward-compatible serde.
- [ ] **O2.2** Eligibility filter before scoring (auth, caps, policy, budget, availability, quota).
- [ ] **O2.3** Selection reason recorded on assignment/run receipt/event; pins override when safe/available.
- [ ] **O2.4** Tests: pinned model honored, ineligible model rejected with typed reason, same-runtime multi-role config.

### Phase 3 — Intelligent router (P0)
- [ ] **O3.1** Task classification (deterministic signals + optional schema-validated refinement hook, off by default).
- [ ] **O3.2** Router scoring (Q/R/C/L/H defaults, confidence-adjusted), policy presets (Auto Balanced/Best Quality/Free Only/Cheapest/Fastest/Local Only/Custom).
- [ ] **O3.3** Budget/resource guards (machine/runtime/provider/model/account/task); no surprise paid escalation.
- [ ] **O3.4** Explainable dispatch record persisted; oracle/baseline comparison hooks for evals.
- [ ] **O3.5** Tests: hard constraints beat score, Free Only never selects paid, explainability fields present, quota/rate-limit handling.

### Phase 4 — Reliable multi-model execution via OpenCode (P0, critical validation)
- [ ] **O4.1** Runtime manager abstraction for OpenCode server/CLI fallback; loopback-only, unique creds, explicit ownership/scope.
- [ ] **O4.2** Session-per-worker with explicit `ModelRef`/variant, worktree isolation, BarkCLI-owned top-level graph.
- [ ] **O4.3** Durable run/session reconciliation on restart; idempotent reservations/claims.
- [ ] **O4.4** Safe handoff artifact for model/provider failures (no blind same-session swap).
- [ ] **O4.5** **Milestone test (PR4 equivalent):** one OpenCode runtime, distinct sessions/models/worktrees, failure/restart/recovery, no duplicate claims. Use fixture/mocked integration where real OpenCode unavailable; document real-environment validation steps.

### Phase 5 — Performance intelligence (P1)
- [ ] **O5.1** Model performance records from verified runs (not self-report).
- [ ] **O5.2** Local benchmark mode (5–10 inexpensive tasks, fixed commit/worktree/limits/permissions).
- [ ] **O5.3** Confidence-adjusted quality priors; exploration bounded, never on high-risk/unproven paths.
- [ ] **O5.4** Tests + privacy/cost guards (no auto expensive probes).

### Phase 6 — Mac/Web experience surfaces (P1)
- [ ] **O6.1** Model Hub API/UI (inventory, status, capabilities, source, measured performance, enable/disable/pin).
- [ ] **O6.2** Team Builder policy mapping (role → policy/pin).
- [ ] **O6.3** Orchestra canvas/inspector fields (model, why selected, worktree, evidence, reassignment/handoff).
- [ ] **O6.4** Review/delivery shows model history + verification receipts; T3 graphite/design tokens, progressive disclosure.
- [ ] **O6.5** Playwright/API tests for critical flows.

## Cross-cutting requirements (every phase)
- Additive/compat serde migrations; existing boards/runs/agents keep working.
- Tests for new behavior + negative cases; `cargo test -p barkcli-core --lib`/relevant server/web suites green.
- Authz/security: sensitive endpoints scoped (B5 patterns), no unsafe shell composition, no network exposure by default.
- Docs: `docs/engineering/ORCHESTRA_*.md` per phase; update `orchestra.md` references only if needed.
- Commit after each coherent task/phase slice with clear message.

## Risks
| Risk | Mitigation |
|---|---|
| Breaking existing provider/team/orchestra flows | Compat shims, feature flags where needed, golden tests, incremental PR-sized commits |
| OpenCode API/version variance | Capability detection + CLI fallback + typed errors; mock fixtures for CI |
| Cost/quota accidents | No auto probes, explicit paid approval, Free Only enforcement, conservative concurrency |
| False confidence from benchmarks | Verified outcomes only, confidence-adjusted stats, task-class separation |
| UI scope explosion | Phase 6 after validated runtime (Phase 4 milestone) |

## Approval gate
**I should not start Phase 1 implementation until you approve this plan** (or tell me to adjust scope/priorities). Reply with: **“approve Phase 1”**, **“approve all phases with Phase 1 first”**, or specific changes.
