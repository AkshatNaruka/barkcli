# Todo: barkcli Management-Layer Upgrade

## Task 1: Milestones model + storage + CLI + MCP
**Description:** Add Milestone model (.board/milestones), storage CRUD, `barkcli milestone` CLI, MCP milestone_* tools, roadmap progress computation.
**Acceptance criteria:**
- [x] `Milestone` model with status (planned/active/shipped), target_date, card_ids, spec_ids, progress
- [x] Storage: read/write/upsert/delete + coverage/progress helpers
- [x] CLI: `milestone list|create|show|assign|ship`
- [x] MCP: milestone_list/create/assign/ship/roadmap
**Verification:**
- [x] `cargo test -p barkcli-core milestone` passes
- [x] `barkcli milestone list` works on dev.board
**Dependencies:** None
**Files likely touched:**
- `barkcli-core/src/models/milestone.rs`
- `barkcli-core/src/storage/milestones.rs`
- `barkcli-core/src/commands/milestone.rs`
- `barkcli-core/src/cli.rs`, `barkcli-core/src/mcp.rs`
**Estimated scope:** Medium (4-5 files)

## Task 2: Gate v2
**Description:** New `agent/gate.rs` multi-step gate with cache/retry/evidence; wire into `RunService::check` and `verify.rs`.
**Acceptance criteria:**
- [x] GateProfile load from verify.json + repo detection
- [x] Head-SHA cache: skip re-run when head/target unchanged and prior passed
- [x] Retry flaky step once, capture tail evidence per step
- [x] `barkcli verify --profile` extended
**Verification:**
- [x] `cargo test -p barkcli-core gate` passes
**Dependencies:** Task 1
**Files likely touched:**
- `barkcli-core/src/agent/gate.rs`
- `barkcli-core/src/agent/verify.rs`
- `barkcli-core/src/runtime/runner.rs`
**Estimated scope:** Medium (3 files)

## Task 3: Merge Train
**Description:** `runtime/merge_train.rs` batch merge service with conflict detection/handling.
**Acceptance criteria:**
- [x] Plan train: order gate-passed runs, dry-run via `git merge-tree`, detect conflicts before merging
- [x] Execute sequentially with per-item status, rollback on failure, idempotent
- [x] CLI `barkcli merge-train plan|run|status` + MCP tools
- [x] Integrates with existing `RunService::merge` eligibility
**Verification:**
- [x] `cargo test -p barkcli-core merge_train` passes
**Dependencies:** Task 2
**Files likely touched:**
- `barkcli-core/src/runtime/merge_train.rs`
- `barkcli-core/src/commands/merge_train.rs`
- `barkcli-core/src/runtime/mod.rs`
**Estimated scope:** Medium (3-4 files)

## Task 4: Worktree Lifecycle v2
**Description:** Persisted lifecycle + setup tracking + checkpoint integration.
**Acceptance criteria:**
- [x] WorktreeInfo persisted to `.board/worktrees/status.json` with state machine
- [x] Setup tracking: detects cargo/npm, records setup command + duration
- [x] Health: list, prune stale, checkpoint refs per worktree
- [x] `barkcli worktree list|status|clean|checkpoint`
**Verification:**
- [x] `cargo test -p barkcli-core worktree` passes
**Dependencies:** Task 2
**Files likely touched:**
- `barkcli-core/src/agent/worktree_lifecycle.rs`
- `barkcli-core/src/agent/worktree.rs`
- `barkcli-core/src/commands/worktree.rs`
**Estimated scope:** Medium (3 files)

## Task 5: First-Class Agent Loop
**Description:** DeepSeek-style embedded loop: turn/step, inbox, tool registry, approval, compaction, subagents.
**Acceptance criteria:**
- [x] `AgentLoop` with Turn/Step lifecycle, events, inbox, cancellation
- [x] Tool registry: bash/fs/search/todo stubs + approval seam
- [x] Compaction: summarize old events when > threshold
- [x] CLI `barkcli agent-loop run` + MCP tools
**Verification:**
- [x] `cargo test -p barkcli-core agent_loop` passes
**Dependencies:** Task 2
**Files likely touched:**
- `barkcli-core/src/agent/agent_loop.rs`
- `barkcli-core/src/agent/mod.rs`
- `barkcli-core/src/commands/agent_loop.rs`
**Estimated scope:** Large (4-5 files)

## Task 6: Production Hardening
**Description:** Health, metrics, doctor, observability, docs.
**Acceptance criteria:**
- [x] `barkcli health` JSON + `.board/metrics.json` counters
- [x] Doctor: worktree/milestone/merge-train checks
- [x] Docs: MANIFEST, README update, EXAMPLES
**Verification:**
- [x] `barkcli health` outputs valid JSON
**Dependencies:** Tasks 1-5
**Files likely touched:**
- `barkcli-core/src/commands/health.rs`
- `barkcli-core/src/util/metrics.rs`
**Estimated scope:** Medium

## Task 7: Tests + Polish
**Description:** Comprehensive tests, clippy, fmt, integration tests.
**Acceptance criteria:**
- [x] Unit + integration tests for all new modules
- [x] `cargo test` (workspace) passes
- [x] `cargo clippy -- -D warnings` clean
**Verification:**
- [ ] Full `cargo test` from workspace root passes
**Dependencies:** Tasks 1-6
**Files likely touched:**
- `barkcli-core/tests/*.rs`
**Estimated scope:** Medium

## Checkpoint: Foundation (After Tasks 1-2)
- [ ] Tests pass, builds clean

## Checkpoint: Core Features (After Tasks 3-5)
- [ ] End-to-end flow works

## Checkpoint: Complete
- [ ] Ready for review
