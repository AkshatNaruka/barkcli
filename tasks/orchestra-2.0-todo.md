# Orchestra 2.0 TODO

> Task list for `tasks/orchestra-2.0-plan.md` (separate from `tasks/todo.md`/`tasks/plan.md`).

## Phase 1 — Model identity + OpenCode discovery foundation (P0) [x]
- [x] O1.1 Normalized model types (`ModelRef`, capabilities, availability, catalog entry)
- [x] O1.2 OpenCode discovery adapter (structured first, CLI fallback), no auto paid/free probes
- [x] O1.3 Cache/refresh + availability states (`DiscoveryReport` cache roundtrip)
- [x] O1.4 Compatibility shim (`ModelRef::legacy_model_id()`, additive module; existing providers unchanged)
- [x] O1.5 Offline fixture tests + compat behavior preserved
- [x] O1 checkpoint: `cargo test -p barkcli-core --lib` **432 passed, 0 failed**; committed `feat(orchestra/phase1)`

## Phase 2 — Dynamic role/model policy layer (P0) [~]
- [x] O2.1 `AgentProfile` model_policy (backward-compatible serde/frontmatter roundtrip)
- [x] O2.2 Eligibility filter (`evaluate_eligibility`: availability/caps/policy/free-paid-local/strategy) + typed reason
- [x] O2.3 Selection/assignment reason types foundation (`orchestra::assignment`) — receipt/event wiring deferred to router/runtime integration
- [x] O2.4 Tests (backward compat, policy roundtrip, Free Only/capability rejection, eligible happy path) — dispatch-path integration in Phase 3/4

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
