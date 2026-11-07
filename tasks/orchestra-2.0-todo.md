# Orchestra 2.0 TODO

> Task list for `tasks/orchestra-2.0-plan.md` (separate from `tasks/todo.md`/`tasks/plan.md`).

## Phase 1 — Model identity + OpenCode discovery foundation (P0) [awaiting approval]
- [ ] O1.1 Normalized model types (`ModelRef`, capabilities, availability, catalog entry)
- [ ] O1.2 OpenCode discovery adapter (structured first, CLI fallback), no auto paid/free probes
- [ ] O1.3 Cache/refresh + availability states
- [ ] O1.4 Compatibility shim for existing provider/runtime consumers
- [ ] O1.5 Offline fixture tests + compat tests
- [ ] O1 checkpoint: `cargo test -p barkcli-core --lib` (relevant) green; docs updated; commit

## Phase 2 — Dynamic role/model policy layer (P0)
- [ ] O2.1 `AgentProfile` model_policy (backward-compatible)
- [ ] O2.2 Eligibility filter (caps/auth/policy/budget/availability/quota)
- [ ] O2.3 Selection reason in assignment/receipt/event
- [ ] O2.4 Tests (pin, ineligible typed reason, multi-role same runtime)

## Phase 3 — Intelligent router (P0)
- [ ] O3.1 Deterministic task classification (+ optional schema hook off by default)
- [ ] O3.2 Scoring Q/R/C/L/H + presets + confidence adjustment
- [ ] O3.3 Budget/resource guards, no surprise paid escalation
- [ ] O3.4 Explainable dispatch records
- [ ] O3.5 Tests (constraints beat score, Free Only, explainability)

## Phase 4 — Reliable multi-model execution (P0, milestone)
- [ ] O4.1 Runtime manager (OpenCode server/CLI fallback, loopback/creds/ownership)
- [ ] O4.2 Session-per-worker, explicit ModelRef, worktree isolation
- [ ] O4.3 Durable reconciliation + idempotent reservations
- [ ] O4.4 Safe handoff artifacts
- [ ] O4.5 Milestone integration test: distinct sessions/models/worktrees + failure/restart (mocked/real steps documented)

## Phase 5 — Performance intelligence (P1)
- [ ] O5.1 Verified run performance records
- [ ] O5.2 Local benchmark mode (inexpensive, fixed conditions)
- [ ] O5.3 Confidence-adjusted priors, bounded exploration
- [ ] O5.4 Cost/privacy guards + tests

## Phase 6 — Mac/Web experience (P1)
- [ ] O6.1 Model Hub API/UI
- [ ] O6.2 Team Builder policy mapping
- [ ] O6.3 Orchestra canvas/inspector + reassignment/handoff
- [ ] O6.4 Review/delivery model history + receipts
- [ ] O6.5 API/Playwright tests
