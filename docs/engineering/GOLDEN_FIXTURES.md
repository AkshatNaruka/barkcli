# Golden Fixtures Catalog (A3)

**Date:** 2026-11-07  
**Scope:** offline, deterministic fixtures using fake providers / `BARKCLI_AGENT_CMD` / disposable Git repos. Must never modify the user's active checkout.

## PLAN.md A3 scenarios → current coverage

| # | Scenario (PLAN.md) | Status | Coverage / notes |
|---|---|---|---|
| 1 | Implement a passing feature with an isolated worktree | **Covered** | `barkcli-core/tests/runtime_run.rs::run_gets_worktree_diff_gate_and_human_merge` (ScriptProvider/FakeProvider path: managed worktree, commits, gate, diff, human approval, merge, context manifest/pack, monotonic thread events, follow-up continuation). `barkcli-core/tests/runner_loop.rs::run_loop_success_then_failure_paths` (BARKCLI_AGENT_CMD: passing agent → gate passes → merge/card done/transcript/worktree released). |
| 2 | Fail a test and retry with gate evidence | **Covered** | `runner_loop.rs::run_loop_success_then_failure_paths` (broken agent, gate fails, retry ceiling hit, task failed, attempts==max, memory fact recorded). |
| 3 | Force two agents to conflict in a predictable way | **Covered** | `runner_loop.rs::run_loop_merge_train_conflict_redispatches` (parallel tasks add same file, add/add conflict → re-dispatch/retry → both complete, landed on main, worktrees released). Also `run_loop_parallel_pool_agents_two` covers non-conflicting parallel merge train. |
| 4 | Kill/restart a controller during execution and during merge | **Gap (B2)** | No runtime restart/reconciliation crash-injection fixtures found. Requires durable run state + restart reconciliation/idempotency APIs (PLAN.md P1-02 / B2). **Do not fake.** Add crash-injection suite when B2 lands: kill before/after spawn, during worktree/gate/receipt/merge; assert exactly one definitive outcome or safe `needs_review`; no duplicate start. |
| 5 | Resume/stop/review an agent run | **Partial** | Runtime tests cover review/approval/merge gating and continuation (`parent_run_id` follow-up). Explicit stop/interrupt/resume lifecycle fixtures across providers need confirmation against `RunHandle`/server/session APIs; add targeted fixtures in B1/B7 conformance. |
| 6 | Exercise a context query whose relevant symbol uses different words from the query (paraphrase vs keyword) | **Gap (eval)** | Context compiler tests exist (`barkcli-core/src/context/pack.rs`), but no explicit paraphrase-recall fixture. Native retrieval is keyword/BM25/TF-IDF-oriented; paraphrase may not retrieve the target today — **this is a baseline/eval fixture, not a forced pass**. Add a deterministic disposable-repo fixture that records inclusion/recall for direct-keyword vs paraphrase queries (A5/P2-06 eval harness). |

## Additional existing fixtures (supporting)
- `barkcli-core/tests/stress_concurrent.rs::concurrent_board_writes_no_corruption` — concurrent RMW safety (10 threads × 10 writes, no lost updates/leaked tmp). Relevant to durability/contention, not run lifecycle.
- `barkcli-core/tests/runtime_run.rs` also asserts: raw provider log path required, context manifest persisted, file changes/usage events, `merge` requires approval, checkpointing partial edits invalidates old checks.

## Fixture principles (enforce in new tests)
- `FakeProvider` / scripted `BARKCLI_AGENT_CMD` only; **no paid model tokens**.
- Disposable temp repos/workspaces (`std::env::temp_dir()`/unique dirs); clean up; **never** modify active checkout.
- Serialize process-global mutations (CWD/env) with a mutex where needed (see `SERIAL` pattern).
- Assert deterministic outcomes (status, attempts, gate verdict, merge/card state, worktree release, key events/facts).
- Record commit/command expectations in test names/docs; separate flaky env issues from product failures.

## Next A3 increments
1. Add paraphrase-vs-keyword context fixture (characterizing + eval-ready) in `barkcli-core/src/context/` tests or `tests/golden_fixtures_*` with disposable repo.
2. Add stop/interrupt/review lifecycle fixture for runtime `RunHandle`/service (offline fake).
3. **Blocked by B2:** kill/restart/reconcile during execution and merge; idempotent recovery; no duplicate spawn; safe terminal/`needs_review` outcomes.
4. Wire fixtures into CI with clear naming (`a3_*` / `golden_*`) and offline-only guards.