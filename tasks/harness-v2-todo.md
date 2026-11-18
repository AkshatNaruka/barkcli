# Bark Harness v2 — checklist

Plan: `tasks/harness-v2-plan.md`

## Phase 1 — measure the loop

- [x] H1 `agent/usage.rs` — `UsageTotals` + `usage_event(stream, line)`
      (Claude result `usage`/`total_cost_usd`/`modelUsage`; Codex
      `turn.completed.usage`; plain-stream auto-detect). Sum tokens, max cost.
- [x] H2 `watch` returns `WatchOutcome { verdict, usage }`; attempt prints
      `Usage: 18.4k in / 2.1k out · 96.0k cached · $0.0412`.
- [x] H3 persist `usage.json`; `TaskOutcome.usage`; `RunReport.usage`;
      `serde(skip_serializing_if)` so usage-free runs keep the old JSON shape.
- [x] H4 tests: 6 unit fixtures + `run_loop_records_backend_usage` integration
      (wrapper backend → usage.json + report roll-up).
- [x] Fixed a pre-existing rustdoc break in `runtime/question.rs` (nested
      fences) so `cargo test -p barkcli-core` is fully green.
- [x] H4b human report: `usage:` header line + per-task `spend:` line, omitted
      when a run reports nothing. Verified end-to-end in a scratch repo with a
      stub `BARKCLI_AGENT_CMD` backend: `--json` carries per-task and rolled-up
      `usage`, and every session dir holds `usage.json`.

Checkpoint: `cargo test -p barkcli-core` green; `barkcli run --dry-run` fine;
`barkcli run … --json` shows usage on a real backend. ✅

## Phase 2 — context, checkpoints, hooks

- [x] H5 `harness/packet.rs`: instruction layers (policy →
      `project_context.md` → `AGENTS.md`/`CLAUDE.md` + ancestors →
      `.board/rules/*.md` → subtree rules), HTML-comment stripping, top-skill
      body + index with bodies written to the session dir, budget trim
      (default 8k tokens; drop order subtree → index → files → rules → agents →
      context), `context.json` manifest, packet id. 120 KB bail removed.
- [x] H6 `harness/checkpoint.rs`: `bark/try/<task>/<n>` tag before spawn
      (commits dirty tracked files), retry resets to the attempt-1 tag +
      `clean -fd`, `harness.retry_reset` opt-out, merge-conflict re-dispatch
      never rewound, tags pruned on merge.
- [x] H7 `harness/lifecycle.rs`: hook bus for `attempt.start`, `pre_spawn`,
      `post_agent`, `post_gate`, `pre_merge`, `attempt.end`; JSON stdin, cwd =
      worktree, exit 0/2/other, `on_failure: warn|block`, timeouts kill the
      hook, `hooks.jsonl` per session. `pre_merge` veto keeps the branch and
      records a finding; `post_gate` veto fails the attempt; `pre_spawn` veto
      aborts before launch. Guard stays a built-in step before user pre_merge
      hooks (receipts depend on its report).
- [x] H8 `harness/permissions.rs`: flags derived from `harness.permissions`
      (`claude --permission-mode/--allowedTools`, `codex --sandbox`), blank
      values fall back to safe defaults, applied via `Recipe::command_with`.
- [x] `HarnessSettings` / `ContextSettings` / `HarnessHook` /
      `PermissionSettings` in `models/config.rs`, all `#[serde(default)]` so
      old configs load.

Checkpoint: prompt p95 ≤ 32 KB on the barkcli board (22.2 KB / 5.7k tokens
with an 18.5 KB `AGENTS.md`); a blocking `pre_merge` hook prevents the merge
and writes a finding. ✅ Verified with a stub backend in a scratch repo.

Follow-ups (phase 3): route `fleet` / `ready` / `mcp` through the same packet
builder, emit `RunRecord` from the CLI runner, verifier subagent, budget
ceiling, harness eval suite.

## Phase 3 — structure

- [x] H9 `harness/record.rs`: one `RunRecord` per attempt in `.board/runs/`
      (the store the web app lists), written in three phases — start (provider,
      permission mode, branch, base SHA, packet id, author), attempt facts
      (exit code, gate verification with tested/target head, diff stats, head
      SHA, files, usage), finish (`merged` / `needs_review` / `failed`).
      Recording is best-effort: a missing board never breaks a run.
- [x] H10 `harness/verify.rs`: verifier subagent with a fresh context (task, AC,
      diff, gate tail — never the author's transcript), documented
      `VERDICT: PASS|FAIL — reason` contract, injected command or the run's own
      backend, timeout → `uncertain` (never a veto). A `FAIL` re-queues with the
      reviewer's reason as the retry verdict; the review is recorded via
      `RunStore::verify_run`, so `author_id` separation is enforced by the
      existing graph rule. `harness.verify` config in `models/config.rs`.
- [x] H11 `harness.budget.max_run_usd` ceiling: the dispatcher stops starting
      attempts at the limit and leaves the rest queued; `RunReport` gains
      `cost_per_merged_change`, `cost_by_backend` (aggregated from
      `.board/runs`) and `budget_ceiling_usd`, all printed in the human report.
      `UsageTotals::merge` sums cost across attempts (each is its own process);
      within an attempt `add` still keeps the peak.
- [x] H12 `barkcli-core/tests/harness_eval.rs`: 8 deterministic scenarios
      (clean merge + history, gate-failure retry with verdict + packet attempt
      number, crashed no-op failure, verifier veto with distinct identity,
      uncertain verifier not blocking, budget ceiling, `pre_merge` hook veto,
      packet trimming under a 500-token budget) with scripted backends, plus a
      dedicated `harness-eval` CI job.

Checkpoint: `cargo test -p barkcli-core` green (534 lib tests + 8 eval
scenarios + 4 runner-loop tests). Scratch-repo run shows `$/merge`,
`cost per merged change (from .board/runs)`, a recorded
`verifier:verifier.sh → pass`, and a `merged` run record carrying the packet id,
gate verification and usage. ✅

Follow-ups (not blocking): route `fleet` / `ready` / `mcp` through the packet
builder, and let the web RunService emit the same `finish` phase for parity.
