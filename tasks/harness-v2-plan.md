# Bark Harness v2

**Goal:** make barkcli's agent loop a *harness* — the thing that owns context,
permissions, lifecycle, verification and cost — instead of a supervisor that
spawns a CLI and reads its exit code.

Status: proposed. Companion checklist: `tasks/harness-v2-todo.md`.
Phase 1 (attempt telemetry) is implemented; phases 2–3 are the remaining plan.
Sources: Claude Code docs (code.claude.com/docs) read 2026-11-18 — `overview`,
`sub-agents`, `hooks`, `skills`, `memory`, `costs`, `checkpointing`,
`agent-teams`, `plugins`, `settings`, `sandboxing`, `agent-sdk`,
`agent-sdk/cost-tracking`.

---

## 0. Thesis

barkcli already contains the *parts* of a strong harness — context manifests,
run records with usage and verification provenance, guard, receipts, a merge
train, memory facts, skills, roles, worktrees. They are split across **two
disjoint execution paths**, and the CLI path that people actually use
(`barkcli run`) bypasses most of them.

Claude Code's advantage is not a better model. It is that the harness, not the
model, owns:

1. **Context assembly** (hierarchical instruction files, progressive skills,
   compaction, context editing).
2. **Capability limits** (permission modes, allowed tools, sandbox).
3. **Lifecycle** (named hook events with exit-code and JSON semantics).
4. **Isolation** (fresh-context subagents, forks, worktree-scoped edits).
5. **Verification and telemetry** (cost/token accounting, checkpoints).

Bark Harness v2 ports those five ideas onto infrastructure barkcli already has.
It does **not** copy Claude Code's product surface.

---

## 1. What barkcli has today

| Layer | Where | Used by `barkcli run`? |
|---|---|---|
| Intent → card → spec → decompose → queue | `commands/intake.rs`, `agent/decompose.rs`, `agent/queue.rs` | yes |
| Worktree per attempt | `agent/worktree.rs` (`bark/<task>`) | yes |
| Prompt builder | `agent/prompt.rs` (`build_task_prompt`, unused `build_cached_task_prompt`) | yes, uncached variant |
| Skills | `skills/registry.rs` (`render_for_prompt` = full bodies) | yes |
| Backend launch + stream parse | `agent/recipe.rs` (`claude -p … stream-json`, `codex exec --json`, `opencode run --auto`) | yes |
| Transcript watch, idle/wall limits | `commands/run_cmd.rs::watch` | yes |
| Gate (tests) + guard + receipts | `run_gate`, `guard::scan_branch_diff`, `receipt` | yes |
| Merge train, retry with failure verdict | `commands/run_cmd.rs::handle_done`, `commands/merge_train.rs` | yes |
| Event-sourced runs (`RunRecord`, `RunUsage`, `GateSummary`, `verifications`, contribution graph) | `runtime/event.rs`, `runtime/store.rs`, `runtime/runner.rs` | **no** |
| Context manifest / pack / ledger | `context/manifest.rs`, `context/pack.rs`, `context/ledger.rs` | **no** |
| Token/cost accounting | `runtime/event.rs::RunUsage` | **no** |
| Roles / profiles / capacity | `agent/roles.rs`, `agent/capacity.rs`, `.board/agents/*.md` | **no** (one agent per task) |
| Orchestra policy / budget / router | `orchestra/policy.rs`, `budget.rs`, `router.rs` | **no** |
| Lifecycle hooks | `commands/hooks.rs` = git hooks only | **no** |

Two runners:

- `commands/run_cmd.rs` — CLI autonomy loop. Ad-hoc, durable, serial/parallel
  workers, receipts. The path users invoke.
- `runtime/runner.rs` — `RunService` used by the web server
  (`barkcli-server/src/lib.rs:6430+`). Context packs, `RunRecord`s, usage,
  verification, merge eligibility.

Everything in the right column of the table above is already modelled in the
second runner. **The core of plan v2 is to make the CLI runner a producer of
the same records, then raise the ceiling on both.**

---

## 2. What Claude Code does that we should copy

### 2.1 Context is hierarchical and lazy, not a blob
- `CLAUDE.md` loads from cwd upward, root→cwd, `CLAUDE.local.md` appended last;
  subdirectory files load *when a file in that directory is read*.
  (`memory` → "How CLAUDE.md files load")
- Auto memory loads only the first 200 lines / 25 KB of `MEMORY.md`; topic files
  are read on demand.
- Skills advertise name + description; the body loads when invoked
  (`skills` → frontmatter / "Skill content lifecycle").
- Cost guidance explicitly says: move instructions from `CLAUDE.md` to skills,
  delegate verbose operations to subagents, prefer CLI over MCP to cut listing
  overhead. (`costs` → "Reduce token usage")

Bark today: `build_task_prompt` inlines every matched skill body, plus the task
and AC, into one prompt handed as a CLI argument, with a hard 120 KB bail
(`recipe.rs::MAX_PROMPT_ARG_BYTES`). `build_cached_task_prompt` (prefix-cache
ordering) exists but nothing calls it. No manifest, no laziness, no subtree
rules.

### 2.2 Lifecycle hooks with deterministic semantics
Claude Code defines ~30 named events (`PreToolUse`, `PostToolUse`, `Stop`,
`SubagentStop`, `TaskCreated`, `TaskCompleted`, `PreCompact`, `SessionStart`,
`WorktreeCreate`, …). Handler contract:
- exit 0 → proceed, apply JSON fields
- exit 2 → block the action
- other → non-blocking error
- JSON on stdout can `allow`/`deny`/`block`, inject `additionalContext`, or run
  an LLM verifier (`type: "prompt"` / `type: "agent"`).
(`hooks` → "Exit code output", "JSON output", "Prompt-based hooks")

Bark today: `guard` is a built-in post-gate scan; there is no way for a project
to inject a check at spawn, on diff, or before merge without editing Rust.

### 2.3 Subagents are cheap by construction
- Fresh, isolated context per subagent; only the delegation prompt crosses over.
- Per-agent `model`, `effort`, tool allow/deny, preloaded skills, own hooks.
- Depth limit + concurrent limit (default 20) with a refusal error that tells
  the model not to retry.
- Fork mode inherits the parent conversation when continuity matters.
- Verifier/author separation is explicit.
(`sub-agents` → "Manage subagent context", "Concurrent subagent limit")

Bark today: one process per task with one flat context; roles exist as data
(`.board/agents/*.md`) but never run as separate contexts.

### 2.4 Usage is first-class
Claude Code's stream-json `result` event carries `usage`
(`input_tokens`, `output_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`), `total_cost_usd`, and per-model `modelUsage`.
(`agent-sdk/cost-tracking`; verified against the protocol shape.)

Bark today: the CLI runner parses only the verdict from that event
(`recipe.rs::stream_event`) and throws the usage object away. `RunReport` has no
token or cost fields, so "which backend/role/prompt policy is cheaper per
merged change" cannot be answered.

### 2.5 Checkpoints are cheap and scoped
Automatic checkpoints before edits; rewind restores files and can summarize;
bash-made changes and subagent edits are explicitly *not* restorable.
(`checkpointing`)

Bark today: retries reuse the same branch/worktree, so a failed attempt's
partial work silently becomes the next attempt's starting point. `base_commit`
is recorded but never used to reset.

### 2.6 Skills and plugins are the packaging unit
Skills = reusable instructions + assets with progressive disclosure, optional
subagent execution and pre-approved tools. Plugins bundle agents + skills +
hooks + MCP. (`skills`, `plugins`)

Bark has a skill registry (builtin + `.board/skills` + user dir) but no
packaging/bundle story for "this team's harness".

---

## 3. Gap table

| Capability | Claude Code | barkcli `run` | Consequence today |
|---|---|---|---|
| Prompt assembly | hierarchical + lazy + budgeted | inline blob, 120 KB bail | big skills silently excluded; no cache reuse |
| Per-attempt usage | `usage` + `total_cost_usd` | discarded | no cost per merged change |
| Context manifest | yes (implicit) | model exists, unused | can't reproduce or diff a prompt |
| Permissions | modes + allow/deny + sandbox | backend defaults | agent can touch anything in the worktree |
| Hooks | 30 events, 5 handler types | git hooks only | project policy requires Rust changes |
| Subagents | fresh context, model/effort per agent | none | planner/verifier not separable |
| Checkpoint/rewind | automatic | retry reuses dirty branch | failure noise accumulates |
| Verification | hooks + review agents | gate + guard + receipts (strong) | keep — this is ahead |
| Cost policy | budget/usage views | `orchestra::budget` unused | no spend ceiling |

Bark is **ahead** on: deterministic acceptance gates, merge train, guarded
merge, receipts, worktree isolation, cross-project threads.

---

## 4. Design

### 4.1 One core, two front-ends

Introduce `barkcli-core/src/harness/` and move the attempt lifecycle there:

```
harness/
  packet.rs    // context assembly -> ContextPacket + manifest id
  spawn.rs     // backend → Command, permission policy, prompt delivery
  stream.rs    // normalized events: verdict | usage | tool | error
  lifecycle.rs // hook bus (attempt.start, pre_spawn, post_gate, pre_merge, end)
  attempt.rs   // run one attempt end-to-end, emit RunRecord
```

`commands/run_cmd.rs` becomes: intake → queue → `harness::attempt` → merge
train. `runtime/runner.rs` becomes the same call with a thread-bound sink.
Both write `RunRecord`s under `.board/runs/`.

**Non-goal:** no behaviour change to gates, guard, receipts or merge ordering in
phase 1. Those are barkcli's differentiators; we wrap them, we don't rewrite.

### 4.2 Context packet (quality + cost)
1. Resolve instruction layers: managed policy → `project_context.md` →
   `AGENTS.md`/`CLAUDE.md` ancestors → `.board/rules/*.md` → subtree rules for
   touched files. Strip HTML comments (saves tokens, matches Claude Code).
2. Skills: include full body for the **top match only**, then an index
   (`id — one-line description — absolute path`) for the rest, with an explicit
   "read these before editing" instruction. Bodies are written to the session
   dir (never the worktree) so the agent can open them.
3. Task/AC/files always included; retry verdict always included last.
4. Budget: default 8k tokens (~32 KB). Trim order: subtree rules → index →
   lowest-ranked skills → context files, never the task, AC, or verdict.
   Emit `ContextPacket { id, bytes, tokens_est, sections[], dropped[] }` and a
   `context.json` in the session dir. Remove the "prompt exceeds budget" bail.
5. Use prefix-cache ordering (`build_cached_task_prompt`) for backends that
   keep a warm process.

### 4.3 Attempt telemetry (this phase ships it)
- Parse `usage` / `total_cost_usd` / `modelUsage` from Claude stream-json and
  `turn.completed.usage` from Codex JSONL.
- Accumulate per attempt (`UsageTotals`), persist `usage.json` next to
  `transcript.log`, and surface totals on `TaskOutcome` + `RunReport`.
- Synthetic single-arg prompt bytes are recorded too, so prompt trims are
  measurable.
- Later: feed `orchestra::budget::BudgetPolicy` to refuse a spawn that would
  exceed the daily ceiling, and rank backends by cost per merged change.

### 4.4 Hook bus (deterministic, not magic)
Events: `attempt.start`, `pre_spawn`, `post_agent`, `post_gate`, `pre_merge`,
`attempt.end`.
- Config: `.board/config.json → harness.hooks[]`, each
  `{ event, command, timeout_secs, on_failure: "warn" | "block" }`.
- Contract: JSON on stdin (task, branch, worktree, gate, usage, diff stat);
  exit 0 proceed, exit 2 block, other warn. `block` on `pre_merge` prevents the
  merge and records a receipt finding.
- Built-in hook: guard is re-expressed as a `pre_merge` hook so project hooks
  and the built-in run through one path.
- Prompt/agent hooks (LLM reviewer) are phase 3: reuse the verifier role.

### 4.5 Roles as real subagents (phase 3)
- `planner` → produces the decomposition (already `agent/decompose.rs`);
  becomes a fresh-context subagent with `effort=low`, read-only tools.
- `implementer` → today's attempt.
- `verifier` → read-only, cannot be `author_id` (`runtime/event.rs::author_id`
  already enforces this for verification), runs the gate + guard + an
  LLM review pass, emits `Verification`.
- Concurrency: reuse `max_agents`, add a depth cap of 1 and a per-run subagent
  budget; a refused spawn returns a non-retryable error to the caller.

### 4.6 Checkpoints (phase 2)
Before spawn: `git -C <worktree> commit -am "bark checkpoint"` only if dirty,
then tag `bark/try-<task>-<attempt>`. On retry: `git reset --hard <tag>` behind
a config flag (`harness.retry_reset`, default true for attempts > 1). Keep the
tag for diffing; prune tags after merge.

### 4.7 Permissions + sandbox (phase 2)
- Derive backend flags from `harness.permissions`: `claude
  --permission-mode acceptEdits --allowedTools Read,Edit,Bash(git:*),Bash(cargo
  test:*)`; codex `--sandbox workspace-write`; document per-backend gaps.
- Deny writes outside the worktree; deny network unless the task declares it.
- Record the effective policy in the `RunRecord` (`permission_mode` already
  exists).

---

## 5. Phases

### Phase 1 — measure the loop (this change)
H1. `agent/usage.rs`: `UsageTotals` + `usage_event(stream, line)` for Claude and
Codex; sum tokens, take max cost (cumulative per process).
H2. `watch` returns `{ verdict, usage }`; attempt prints tokens/cost.
H3. Persist `usage.json` per session; `TaskOutcome.usage`; `RunReport.usage`.
H4. Tests: fixture parsing (Claude result, Codex turn, plain), accumulation,
   and an end-to-end runner-loop assertion that a stub backend's usage lands in
   the report.

**Done when:** `barkcli run … --json` reports tokens and cost per task and in
total, for Claude and Codex, with tests.

### Phase 2 — context + checkpoints + hooks
H5. `harness/packet.rs` with layering, skill index, budget, `context.json`.
   Drop the 120 KB bail.
H6. Checkpoint tag before spawn; optional reset on retry.
H7. `harness/lifecycle.rs` hook bus with `pre_merge` blocking; guard stays a
   built-in step ahead of user `pre_merge` hooks (see deviations).
H8. `harness/permissions.rs` backend flag derivation.

**Deviations from the plan, as built:**

- *Guard stays built-in, not re-homed as a hook.* Receipts read the guard report
  and the merge decision is derived from it, so moving guard into the user hook
  bus would either duplicate the scan or make the trust layer depend on config
  ordering. Guard keeps its slot between gate and `pre_merge`; user hooks run
  after it, so a project hook sees a guard-passed branch.
- *Retry reset is guarded by ancestry.* Resetting to the attempt-1 tag is only
  safe when that tag is still an ancestor of the worktree HEAD. A
  merge-conflict re-dispatch recreates the worktree on a main that already
  contains other work; rewinding there re-introduces the conflict (caught by
  `run_loop_merge_train_conflict_redispatches`). Both the ancestry check and an
  explicit `merge conflict…` verdict check now skip the reset.
- *Hooks emit at six events, `attempt.start` included.* The plan listed five.
  Policy that prepares state (create a changeset stub, tag a ticket) has to run
  before the checkpoint commit and the spawn, which no other event covers.

### Phase 3 — structure
H9. Emit `RunRecord` from the CLI runner (usage, gate summary with head SHAs,
   diff stats, context_manifest_id) so web and CLI share one history.
H10. Verifier subagent + LLM review hook; `author_id` separation enforced.
H11. Budget ceiling from `orchestra::budget`; per-backend cost per merged
   change in reports.
H12. Harness eval suite: N intents × stub backends × expected gate/merge/retry
   transitions, run in CI.

**As built (phase 3):**

- *H9 landed as a thin module, not a second store.* `harness/record.rs` wraps
  `RuntimeStore`, so "shared history" means literally the same files. The
  attempt is created after a successful spawn (a pre-spawn veto leaves no
  record) and carries the runner's pid so the web reconciler can tell
  "in progress" from "orphaned".
- *H10's verifier is opt-in and cannot outvote the gate on silence.* Only a
  parsed `FAIL` blocks; timeouts and unparseable output are `uncertain` and are
  not recorded as verifications at all, so the contribution graph never gains a
  phantom failed review.
- *H11 splits "ceiling" from `orchestra::budget`.* `BudgetPolicy` governs
  whether a *paid model* may be chosen (and defaults to denying paid models),
  which is the wrong switch for a per-run cap; `harness.budget.max_run_usd`
  stops dispatching new attempts without touching model selection. Both can be
  set together.
- *H12 is a normal integration test plus its own CI job* (`--test-threads=1`,
  since the scenarios mutate cwd/env), so the harness cannot regress silently
  while `cargo test` stays green.

---

## 6. Metrics

| Metric | Today | Target |
|---|---|---|
| Prompt bytes per attempt | unbounded, bails >120 KB | ≤32 KB p95, tracked |
| Cost per merged change | unknown | reported per backend/role |
| Retry rate after gate failure | unknown | −20% via checkpoint reset + verdict injection |
| Context reuse | none | prefix-cache ordering on warm backends |
| Time to diagnose a failed attempt | transcript grep | `context.json` + `usage.json` + hook log |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Prompt slimming hurts quality | keep full body for top skill; A/B via eval suite before default-on |
| Hook bus becomes a footgun | timeouts, `on_failure: warn` default, JSON contract tested |
| Duplicate run history (two runners) | phase 3 unifies on `RunRecord`; phase 1 only adds fields |
| Backend stream shapes drift | parser is per-backend + fixture tests; unknown shapes degrade to no-usage |
| Reset-on-retry discards good work | checkpoint tag retained; config flag to keep dirty branch |

## 8. Explicitly out of scope

- Copying Claude Code's permission prompt UX (bark is headless-first).
- A plugin marketplace.
- Replacing backend CLIs with the Anthropic API.
- Touching gates, guard or merge ordering semantics.
