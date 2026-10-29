# PLAN-011 — Collective memory

## Phase 0 — Desktop sidecar coexistence

- [x] App mode uses `server-app.pid` / `server-app.json`.
- [x] Standalone `barkcli serve` can run alongside the desktop.
- [x] Manual test: standalone on 4455 + app on a private port.

## Phase 1 — Contribution DAG

- [x] `ContributionKind`, `Verification`, graph fields on `RunRecord`.
- [x] `parent_run_id` + `contributes_to[]` canonical edges.
- [x] `RuntimeStore::link_run` with cycle rejection.
- [x] `RuntimeStore::contribution_index` rebuilt from run JSON.
- [x] `ancestry` / `descendants` / `duplicate_candidates`.
- [x] Tests for self-verification, edges, evidence, neglected, duplicates.

## Phase 2 — Verification protocol

- [x] `RunService::verify` re-runs the gate in the worktree (or merged root).
- [x] Self-verification rejected in core, CLI, and API.
- [x] `Review` thread event on verification.
- [x] `barkcli verify-run`.
- [x] `POST /api/runs/:id/verify`.
- [x] Verify action in the run summary.
- [x] Manual contributions can be verified as explicit attestations.

## Phase 3 — Analyze + Brain

- [x] `ContributionIndex::analysis` with leading/neglected/contested/hypotheses.
- [x] UCB recommendations and metrics.
- [x] `barkcli analyze [--json]`.
- [x] `GET /api/contributions` + `/analyze`.
- [x] Brain `Graph | Contributions` segmented control.
- [x] Metric chips, sections, node cards, thread navigation.
- [x] New contribution dialog (`POST /api/contributions`).
- [x] Duplicate warning section.

## Phase 4 — Live index

- [x] Broadcast `contribution_published` / `_verified` / `_merged`.
- [x] WebSocket forwards structured events with version.
- [x] Brain panel refreshes silently on `bark-contribution`.
- [x] `GET /api/contributions/duplicates`.
- [x] `files_touched` recorded from the run diff.
- [ ] "N agents working on this branch" badge (deferred).
- [ ] Conflict UI on the Board (deferred).

## Phase 5 — Optional orchestration

- [x] `barkcli contribute` creates a manual insight/hypothesis/report.
- [x] MCP: `contribution_analysis`, `contribution_add`, `contribution_link`,
      `contribution_verify`.
- [x] `barkcli link-run` links existing runs.
- [x] "Build on" action on terminal runs.
- [x] Board remains the intent layer; graph is the memory layer.
- [ ] `bark contribute` without a card from the daemon (CLI covers it).

## Phase 6 — Measurement

- [x] Metrics: nodes, edges, verified rate, neglected, contested, reuse,
      largest lineage share, 7d velocity, active authors.
- [x] `analyze --json` for external benchmarks.
- [ ] Matched-compute benchmark vs. a no-graph baseline (deferred).

## Verification

- [x] `cargo test --workspace` — all green.
- [x] `cargo check --manifest-path desktop/Cargo.toml`.
- [x] `npm --prefix web test -- --run` — 56 tests.
- [x] `npm --prefix web run build`.
- [x] `bash desktop/scripts/build-macos-app.sh` — bundle verifier passed.
- [x] `bash desktop/scripts/smoke-app.sh` — graph + ancestry through the bundle.
- [x] Manual: app starts while a standalone `barkcli serve` is running.
- [x] Manual: Brain → Contributions renders real graph data and publishes an insight.
