# SPEC-011 — Collective memory (Agora-style discovery)

> Status: implemented · Branch: `feat/collective-memory` · Scope: Rust core/server, CLI, web Brain, desktop startup

## Thesis

Bark already stores tasks, specs, memory, sessions, checkpoints, and code context
in Git. Agora (NVIDIA, arXiv:2609.18094) showed that the next layer is a
**shared, verifiable contribution graph**: every result, hypothesis, failure,
and reproduction is an immutable node with parent edges, independent evidence,
and diversity-aware recommendations. This spec adds that layer to Bark so agents
build on each other's verified work instead of starting from zero.

The graph is **always on**. Older runs without graph metadata are read as flat
result nodes; no migration is required. Missing fields degrade gracefully.

## Architecture

```text
RunRecord (one node per attempt)
  ├─ kind: result | hypothesis | verification | report | insight | failure
  ├─ parent_run_id + contributes_to[]        ← canonical DAG edges
  ├─ verified_by[] + verifications[]         ← independent reproduction
  ├─ files_touched[]                          ← duplicate/conflict detection
  └─ evidence_score
        │
RuntimeStore
  ├─ link_run(child, parent)                  ← cycle-checked, append-only
  ├─ verify_run(run, verifier, passed, note)  ← rejects self-verification
  └─ contribution_index()                     ← rebuildable from run JSON
        │
ContributionIndex
  ├─ ancestry(run) / descendants(run)
  ├─ duplicate_candidates()
  └─ analysis() → leading / neglected / contested / open hypotheses /
                  UCB recommendations / metrics
        │
CLI: barkcli analyze | contribute | link-run | verify-run | ancestry
MCP: contribution_analysis | contribution_add | contribution_link | contribution_verify
API: GET /api/contributions | /analyze | /duplicates
     GET /api/runs/:id/ancestry
     POST /api/runs/:id/link | /verify
     POST /api/contributions
Web: Brain → Contributions (leading, neglected, contested, open hypotheses,
     recommendations, metric chips, new contribution dialog, duplicate warning)
```

## Semantics

- **Independent verification.** A verification counts only when the verifier is
  different from `author_id` (explicit author > agent profile > provider).
  Self-verification is rejected at the store boundary; the CLI/API surface the
  same error.
- **Evidence score.** `ln(1 + independent_verifications) + 0.5 * reuse_count +
  0.25 if gate passed`. Reuse is the number of child contributions.
- **Verification.** `RunService::verify` re-runs the gate in the run's worktree.
  If the run is merged and the worktree is gone, it runs against the project
  root. A passed run without a worktree is refused rather than attested.
- **Neglected.** Terminal, non-verification nodes with no children after 24h,
  ranked by evidence and recency.
- **Contested.** Nodes with at least one passed and one failed verification, or
  a passed gate plus a failed verification.
- **Recommendations.** UCB-style `evidence + sqrt(2 ln N / (reuse + 1))` with
  small bonuses for neglected/contested/open-hypothesis lanes; max 8.
- **Duplicates.** Result nodes sharing at least one `files_touched` path.
- **Live updates.** Server broadcasts `contribution_published`,
  `contribution_verified`, and `contribution_merged` over the existing
  WebSocket; the Brain panel refreshes silently.

## Desktop startup fix

`serve --app` used the shared `.board/server.pid`/`server.json`, so a developer
running `barkcli serve` for the same project caused the desktop to exit 3. App
mode now writes `server-app.pid`/`server-app.json` and can coexist with a
standalone server. Board writes remain protected by file locks.

## Acceptance criteria

- Every run appears in the contribution graph; old run files still load.
- `barkcli contribute` creates a node; `link-run` adds a cycle-checked edge;
  `verify-run` rejects self-verification and records independent evidence.
- `barkcli analyze` prints leading/neglected/contested/open hypotheses and
  recommendations; `--json` returns the full analysis.
- Brain → Contributions renders the same analysis, publishes manual insights,
  and opens a node's thread.
- Duplicate candidates appear when two results touch the same file.
- WebSocket contribution events refresh the panel without a full page reload.
- The desktop starts while a standalone server is running.
- Rust tests, web tests, build, packaged smoke, and bundle verification pass.

## Deferred

- Hunk-level accept/reject.
- Cross-project contribution graphs.
- A matched-compute benchmark comparing Bark with and without the graph.
- Embedded PTY/editor.
