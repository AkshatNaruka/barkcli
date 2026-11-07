# Implementation Plan: barkcli Management-Layer Upgrade

## Overview
Upgrade barkcli from MVP management shell to production-ready orchestration platform: merge train with conflict handling, first-class agent loop (DeepSeek-style), milestones/roadmap, gate hardening, and worktree lifecycle v2. All changes file-is-truth, offline-first, no DB.

## Architecture Decisions
- **Milestones as first-class model** alongside Sprint/Spec: Milestone { id, title, target_date, status, card_ids, spec_ids } persisted `.board/milestones/<board>.json`. Roadmap view via CLI + MCP.
- **Merge Train as dedicated service** (`runtime/merge_train.rs`): batch of gate-passed runs, topological order (dependency-free first), dry-run conflict detection via `git merge-tree`, sequential merge with rollback, per-item verdicts.
- **Gate v2** (`agent/gate.rs`): profile steps with parallel option, head-SHA cache, retry (1 on flake), evidence bundle (per-step tail), integration with verify profiles and guard scan.
- **Agent Loop v1** (`agent/agent_loop.rs`): DeepSeek-inspired turn/step lifecycle with append-only session log per card (threads), inbox, tool registry, approval seam, compaction trigger, subagent spawn hook. Embedded, offline-friendly via ProviderAdapter.
- **Worktree Lifecycle v2** (`agent/worktree_lifecycle.rs`): persisted status map, setup tracking (cargo/npm feasibility), health probe, checkpoint refs, prune policy.
- **Production readiness**: structured JSON health (`barkcli health`), Prometheus-style metrics file, doctor expansion, graceful merge-train lock, idempotent operations.

## Task List

### Phase 1: Foundation
- [x] Task 1: Milestones model + storage + CLI `milestone` + MCP tools + tests
- [x] Task 2: Gate v2 module (multi-step profile, cache, retry, evidence) + integrate with RunService.check + verify.rs

### Checkpoint: Foundation
- [x] cargo test --lib passes, cargo clippy clean

### Phase 2: Core Features
- [x] Task 3: Merge Train service (conflict detection via merge-tree, batch merge, rollback) + CLI `merge-train` + MCP
- [x] Task 4: Worktree Lifecycle v2 (status persistence, setup tracking, health, checkpoint) + enhance worktree.rs
- [x] Task 5: First-class Agent Loop (turn/step, inbox, tool registry, compaction, subagents) + `agent-loop` CLI + MCP

### Checkpoint: Core Features
- [x] End-to-end: milestone -> plan -> run -> gate -> merge-train -> merged

### Phase 3: Polish / Production
- [x] Task 6: Health/metrics/doctor/prod hardening + docs + README/AGENTS updates
- [x] Task 7: Full test suite + integration tests + clippy + fmt

### Checkpoint: Complete
- [x] All acceptance criteria met, production-ready

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Git worktree concurrency | Merge corruption | File locks + merge-train lock, dry-run first |
| Agent loop over-scope | Bloated code | Minimal viable loop: turn/step + inbox + tools; delegate to providers |
| Backward compat | Broken boards | Serde defaults on all new models; migrate-on-read |

## Open Questions
- None — proceed with defaults above.
