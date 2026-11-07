# Gate / Merge Integrity Audit (B4.1)

**Date:** 2026-11-07  
**Scope:** source inspection of `barkcli-core/src/runtime/runner.rs`, `runtime/event.rs` (gate types), `barkcli-core/tests/runtime_run.rs`, server route wiring. **Not a full conformance/security proof.**

## Observed controls (good)

### Merge preconditions (`RunService::merge`)
- Requires explicit `approved: bool` (`merge requires explicit human approval`).
- Acquires per-run check lock and merge-train lock.
- Rejects already-merged runs.
- Requires gate verdict present.
- Requires `gate.verified()` **and** `run.status == RunStatus::Passed`.
- Rejects if open/unresolved review comments exist.
- Recomputes/loads branch/worktree/root/base/head; loads `CheckVerification` proof.
- **SHA/revision binding checks:**
  - branch `HEAD` == `proof.tested_head`
  - repo `HEAD` == `proof.target_head`
  - `run.head_sha` == `proof.tested_head`
  - worktree and repo have no tracked porcelain changes (`--untracked-files=no`)
  - on failure: `The reviewed code or target branch changed. Re-run checks and review the updated changes before merging.`
- Guard scan (if enabled) runs on branch diff with configured policy.
- Performs merge-base, `--no-ff --no-commit` merge of `proof.tested_head`, rechecks repo HEAD unchanged, commits, marks merged, releases worktree/branch.

### Eligibility checks (`merge_eligibility`)
- Validates current repo/worktree heads against proof target/tested heads.

### Gate proof model (`GateSummary`/`CheckVerification`)
- `GateSummary::verified()` requires: `passed`, non-empty `command`, verification proof with `outcome == Passed`, `exit_code == Some(0)`, non-empty `tested_head` and `target_head`.
- Legacy boolean-only gate should not authorize merge (message: “Missing, skipped, or historical check results are not verification”).

### Existing tests (evidence)
- `runtime_run.rs`: merge requires approval; checkpointing partial edits invalidates old checks; gate pass/worktree/diff/context/monotonic events/human merge covered.
- `runner.rs`: returns explicit rejection messages for approval, missing gate, changed code/target, unresolved review comments.

## Gaps / B4 follow-ups
1. **Caller-controlled `approved` boolean:** core requires explicit flag, but proof that the *human reviewed the exact SHA* is not cryptographically bound to `approved`. Server/UI must present diff for `tested_head`/`run.head_sha`, record approval against that revision, and reject stale approvals (B4.2).
2. **Server merge handler audit:** verify `/api/runs/{id}/merge` enforces authz (B5), passes approval only with valid request semantics, returns clear errors, and cannot bypass `RunService` checks.
3. **Request-changes/approve state machine:** ensure request-changes clears/invalidates approval; approvals are scoped to run/revision; idempotent responses.
4. **Untracked files policy:** merge checks ignore untracked files in repo/worktree (`--untracked-files=no`). Confirm this matches intended gate scope (tests/build artifacts) and cannot hide relevant untracked source.
5. **Guard strictness profiles:** advisory default preserved; add explicit strict profiles and UI/API parity (PLAN P1-04).
6. **Merge race with external HEAD changes:** HEAD recheck exists after merge attempt; add fault-injection tests (concurrent merge, target moved, branch rewritten).
7. **`run_cmd` autonomy path parity:** CLI merge-train path must apply same SHA/proof/review invariants as `RunService::merge` (B1.5/B4).

## B4 acceptance target
- No merge without verified gate proof for current tested/target heads.
- No approval/merge for changed SHA or unresolved review comments.
- Server/MCP/CLI paths share identical invariants and negative tests.
- Crash/race tests prove no double merge or silent acceptance of stale revision.