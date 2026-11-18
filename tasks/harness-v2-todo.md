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

## Post-plan — LeanToken adapter

- [x] `harness/leantoken.rs`: optional adapter around
      [LeanToken](https://github.com/morluto/leantoken)'s `index` +
      `--json context`. Explicit token budget (default 800), 20s cap, pointers
      by default (`code_index_snippets` pastes source), tolerant parser for the
      documented payload, and `index_not_ready` / non-JSON / timeout degrade to
      "no section".
- [x] Packet: `## Relevant code` section with its own drop priority (kept
      longer than the generic file list, dropped before project rules) and a
      `code_index` entry in `context.json`.
- [x] Config: `harness.context.code_index` (`auto` | `off`),
      `code_index_budget_tokens`, `code_index_snippets`.
- [x] Tests: 8 unit tests (payload shape, snippet bounds, malformed/unready
      output, bad ranges, detect precedence, timeout kills the child) + 4 packet
      tests (section, manifest, snippets, drop order) + one eval scenario with
      a stub binary, so CI never installs LeanToken.
- [x] Verified end-to-end with the real CLI in a scratch repo: the packet
      gained `- \`src/cancel.rs:1-3\` — text; symbol` for a cancellation task.
- [x] Board/session artifact blacklist:
      - `harness/leantoken.rs`: `is_blacklisted_artifact` drops `*.board`, `*.board.lock`,
        `.board/**`, `.agents/**`, `.claude/**`, `.opencode/**`, `.sessions/**`,
        `project_context.md`, `skills.lock`, and session jsonl logs.
      - `sanitize_query`: strips tracking artifacts and board file references from
        the `--task` string so LeanToken indexes actual source code.
      - `harness.context.code_index_blacklist`: user-configurable blacklist patterns in config.
- [x] Smart failure diagnostics (better than Claude Code & DeepSeek Harness):
      - Failure mode classification in `packet.rs`: compilation/syntax errors, test assertion
        failures, runtime panics, timeouts, and verifier rejections receive dedicated diagnostic
        guidance for 1-shot retry fixes.
- [x] Best skills library:
      - 5 new built-in skills: `debugging.md`, `refactoring.md`, `api-design.md`,
        `frontend-design.md`, `swe-bench.md`.
      - Curated catalog in `skills_sh.rs` enriched with `systematic-debugging` and `e2e-playwright`.
- [x] Best automations setup:
      - Git `pre-push` guard hook verification (`barkcli guard --quick`).
      - CI workflow generator for GitHub Actions (`.github/workflows/bark-gate.yml`).
- [x] Cross-project review selection:
      - `ReviewSurface.tsx` project dropdown filter for unified multi-project review.

Deliberately not done: MCP registration. LeanToken ships `npx leantoken setup`
for MCP-capable hosts, and the CLI runner's packet path works for every backend
(including `agent-cmd`, where MCP is unavailable). Wiring `--mcp-config` into
`Recipe` for the runner is a separate, orthogonal change.
