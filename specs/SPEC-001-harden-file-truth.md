# SPEC-001 — Harden: File Is Truth

**Status:** planned  
**Branch:** `feat/spec-001-harden`  
**Depends:** none  
**Days:** 3  
**Risk:** High (data integrity)  

## Goal

Make `barkcli` boringly reliable. Parallel `add`/`mcp card_create` never corrupt `*.board`. `orchestrate cycle` persists across restarts. Every task has `context_files`.

## Context

From Vision §6.2 / §20 P0 and audit G1-G4:
- `board_file.rs:58 write_board` already atomic tmp→rename but not lock-guarded in all paths.
- `util/lock.rs` uses `fs2` advisory `.lock` sidecar, `queue.rs:319 save()` already `with_lock`, but `board_file.rs` and `specs.rs` inconsistently use it.
- `agent/orchestrate.rs:65 new()` creates empty `TaskQueue`/`AgentRegistry`, `dispatch_task:257` pushes `Vec::new()` context → queue tasks have no file context.

Solo-ICP needs offline reliability before any mind/skills wow.

## Requirements

### R1 — Atomic, locked board writes

All mutating `storage/*` functions MUST go through `util/lock.rs::with_lock(path, || ...)` + atomic tmp→rename on same filesystem.

- `board_file.rs: write_board` → wrap body in `with_lock(&path, || { ... tmp write + rename ... })`
- `board_file.rs: read_board` does not need lock (read is safe; write lock is exclusive).
- `storage/specs.rs`, `storage/sprints.rs`, `storage/context.rs`, `storage/memory/` equivalent writers → same pattern (audit each `write_*`).
- Lock path = `path.with_extension(".lock")` (already in `lock.rs:22`). Ensure `.board/locks/` not needed — lock lives beside file.

### R2 — Orchestration persistence

`OrchestrationEngine` must load and persist real state.

```rust
// agent/orchestrate.rs::new — load from disk
let tasks_path = board_dir.join("tasks").join(format!("{}.json", board_name));
let task_queue = TaskQueue::load(&tasks_path).unwrap_or_default();
let registry_path = board_dir.join("agents").join("registry.json");
let agent_registry = AgentRegistry::load(&registry_path).unwrap_or_default();
// velocity: load from sprints if exists else VelocityTracker::new()
```

`run_cycle:94` must:
1. analyze_board
2. decompose_ready_cards (skip active/blocked)
3. for each plan, `dispatch_task` with populated context (R3)
4. `task_queue.save(&tasks_path)` BEFORE monitoring
5. monitor + evaluate + `save_state()`

### R3 — Dispatch context population

`dispatch_task:257` currently `Vec::new()`. Fix:

```rust
fn dispatch_task(&mut self, plan: &TaskPlan) -> Result<()> {
  for child in &plan.child_cards {
    let ctx_files = crate::agent::queue::populate_context_files(&plan.parent_card, &self.state.board_name);
    // optionally enrich: callgraph top 5, metrics hint — defer to P1, but ctx_files must be non-empty if BoardContext has it
    let task = create_task(..., ctx_files, ...);
    self.task_queue.add(task);
  }
  Ok(())
}
```

MCP `tool_task_create:1409` already calls `populate_context_files` — keep consistent.

### R4 — Stress test

Add `barkcli-core/tests/stress_concurrent.rs`:
- spawn 10 threads, each 10× `board_file::read_board` + `write_board` with unique card, plus `TaskQueue::load`/`save`
- assert no `*.board.tmp` left, no parse error, final card count = 100
- run in CI `cargo test --test stress_concurrent -- --test-threads=10`

## Acceptance Criteria

- [ ] `cargo test` green (existing + new stress test)
- [ ] `cargo clippy` 0 warnings on `barkcli-core`
- [ ] Manual: 10× parallel `barkcli add "t-$i" &` → `barkcli list` shows all, `cat *.board` valid YAML, no lock file leak
- [ ] Manual: `barkcli plan <id> --tasks` → `cat .board/tasks/<board>.json | jq '.tasks[0].context_files | length >0'` when `context scan` run
- [ ] Manual: `barkcli orchestrate cycle` twice → second run sees queue from first (`tasks` count persists)
- [ ] `board_file::write_board` code contains `with_lock` (grep)

## Out of Scope

- Mind/snapshot/overview (SPEC-002)
- Skills (SPEC-003)
- `Card.spec_id` migration
- ONNX embeddings
- Milestones

## File Impact

```
modified:
  barkcli-core/src/storage/board_file.rs     # R1
  barkcli-core/src/storage/specs.rs          # R1
  barkcli-core/src/storage/sprints.rs        # R1 (if needed)
  barkcli-core/src/storage/context.rs        # R1
  barkcli-core/src/agent/orchestrate.rs      # R2, R3
  barkcli-core/Cargo.toml                    # if test dep
new:
  barkcli-core/tests/stress_concurrent.rs    # R4
```

## Implementation Notes

- Keep lock file extension as `.board.lock` (board) / `.json.lock` (queue) — already handled.
- Atomic rename requires tmp file on same directory (`dir.join(temp_name)`), not `/tmp`.
- `TaskQueue::save` already `with_lock`; ensure orchestration does not double-lock same path in same thread (nesting `with_lock` would deadlock if same `.lock` file — load, mutate in mem, single save at end).

## Verification

```bash
cargo test -- --test-threads=10
cargo test --test stress_concurrent
ls -la *.board* .board/tasks/ # no .tmp / .lock leaked
barkcli orchestrate cycle --help # should exist via mcp/server, CLI alias dispatch
```
