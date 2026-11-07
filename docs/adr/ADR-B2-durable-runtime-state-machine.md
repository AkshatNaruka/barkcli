# ADR B2 — Durable Run State Machine + Restart Reconciliation

**Status:** Proposed (scaffold)  
**Date:** 2026-11-07  
**Related:** B1, B4, A3 gap #4, `docs/engineering/GOLDEN_FIXTURES.md`

## States (target model)
`queued -> preparing_worktree -> provider_starting -> running -> collecting_evidence -> checks_running -> awaiting_review -> approved -> merging -> merged | failed | cancelled | timed_out | stale_needs_rerun`

Rules:
- Transitions are **append-only events** with monotonic `seq` and `run_id`/`attempt_id`.
- Side effects (worktree create, provider start, check run, merge) use **idempotency keys** / state guards.
- Duplicate start/claim/merge is a no-op or typed conflict, never a second agent/merge.
- SHA/proof invalidation moves run to `stale_needs_rerun` or blocks approval/merge.

## Persistence
- Canonical run record + event log under runtime store (`.board/` project-local) with atomic writes/temp+rename where practical.
- Receipt contains: intent/card, provider/model/capabilities, worktree path/branch, base/tested/target SHAs, check commands/results/verification, approval metadata (attested SHA when provided), merge outcome.

## Restart reconciliation
On service start or run inspection:
1. Scan non-terminal runs.
2. Check process/provider liveness (if observable), lock files, worktree/head state.
3. Reconcile: mark `failed`/`timed_out`/`stale_needs_rerun` as appropriate; never silently mark `merged` or `passed` without proof.
4. UI/MCP/CLI show reconciled state with reason.

## Crash/kill fixtures (A3 gap #4)
Deterministic harness (follow-up): start fixture run, force-kill after selected state boundary, restart service, assert single terminal outcome and no dup side effects. Blocked in-session by process orchestration complexity; scaffold required.

## Acceptance
- Restart/timeout/partial-write tests pass; duplicate launch/merge prevention proven; no completed run without durable proof.
