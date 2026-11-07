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

## Phase 3 — Intelligent router (P0) [x core]
- [x] O3.1 Deterministic task classification (`TaskAnalysis::classify`, keyword/signal heuristics; model refinement hook deferred)
- [x] O3.2 Scoring Q/R/C/L/H + strategy presets + conservative security adjustment (neutral priors when history unknown)
- [x] O3.3 Budget/resource guards (`BudgetPolicy` blocks unpaid/over-limit; paid requires explicit approval path; `ResourceCapacity` type)
- [x] O3.4 Explainable dispatch records (`ModelAssignment` score/reasons/rejected candidates)
- [x] O3.5 Tests (Free Only never selects paid, hard capability constraints beat score, pin behavior, explainability)

## Phase 4 — Reliable multi-model execution (P0, milestone) [scaffolded]
- [~] O4.1 Runtime manager (OpenCode server/CLI fallback) — **design/interface required**; integrate with existing `ProviderAdapter`/runner (see `docs/engineering/ORCHESTRA_PHASE4_NOTES.md` if added) / existing ADR-B1.
- [~] O4.2 Session-per-worker, explicit `ModelRef`, worktree isolation — **requires runner/StartRun model-ref wiring + OpenCode session API/CLI integration tests**.
- [~] O4.3 Durable reconciliation + idempotent reservations — **requires ADR-B2 state machine/reconciliation work**.
- [x] O4.4 Safe handoff artifacts — `orchestra::HandoffArtifact` type added (verified fields; no blind same-session swap policy documented).
- [ ] O4.5 Milestone integration test — **blocked** on O4.1/O4.2 + real/mocked OpenCode multi-session environment.

## Phase 5 — Performance intelligence (P1) [scaffolded]
- [x] O5.1 Verified run performance record type — `orchestra::ModelPerformanceRecord` (from verified outcomes only).
- [ ] O5.2 Local benchmark mode — requires fixed fixture harness/commands and opt-in execution.
- [ ] O5.3 Confidence-adjusted priors/bounded exploration — router accepts priors; persistence/bandit logic deferred.
- [x] O5.4 Cost/privacy guards foundation — no auto probes; budget guards in Phase 3.

## Phase 6 — Mac/Web experience (P1) [planned]
- [ ] O6.1 Model Hub API/UI
- [ ] O6.2 Team Builder policy mapping
- [ ] O6.3 Orchestra canvas/inspector + reassignment/handoff
- [ ] O6.4 Review/delivery model history + receipts
- [ ] O6.5 API/Playwright tests
- **Note:** depends on Phase 4 runtime integration for live data; can start with read-only inventory/policy UI once APIs exposed.
