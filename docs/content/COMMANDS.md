# Commands Reference

Complete reference for all barkcli commands.

## Table of Contents

- [Core Commands](#core-commands)
- [Task Management](#task-management)
- [Linking](#linking)
- [Board Management](#board-management)
- [Code Context](#code-context)
- [Sessions & Checkpoints](#sessions--checkpoints)
- [Interfaces](#interfaces)
- [Pro Commands](#pro-commands)
- [Housekeeping](#housekeeping)
- [Orchestration](#orchestration)
- [Autonomy](#autonomy)
- [Trust Layer](#trust-layer)
- [Spec Management](#spec-management)
- [Flags](#flags)

---

## Core Commands

The essential commands for daily use.

### `barkcli init`

Initialize barkcli in the current project. Creates a `.board/` directory with configuration.

```shell
barkcli init
```

### `barkcli add <title>`

Add a new task to the board.

```shell
barkcli add "Fix authentication bug"
barkcli add "Implement JWT login" -p high -l backend,auth
barkcli add "Write documentation" --due 2024-12-15 --effort 3
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --priority` | `high`, `medium`, `low` (default: medium) |
| `-l, --label` | Labels (repeatable) |
| `-a, --assignee` | Person assigned |
| `-c, --column` | Target column (default: first column) |
| `-d, --description` | Task description |
| `--due` | Due date (YYYY-MM-DD) |
| `--remind` | Reminder time (YYYY-MM-DD or YYYY-MM-DDTHH:MM) |
| `--effort` | Story points |
| `--area` | Area path |
| `--ac` | Acceptance criterion (repeatable) |

### `barkcli list`

Show all tasks grouped by column.

```shell
barkcli list
barkcli list -c doing          # filter by column
barkcli list -p high           # filter by priority
barkcli list -l backend        # filter by label
```

### `barkcli move <id> <column>`

Move a task to a different column.

```shell
barkcli move jwt-login doing
barkcli move fix-auth-bug done
```

### `barkcli done <id>`

Shortcut to move a task to the "done" column.

```shell
barkcli done jwt-login
```

### `barkcli log`

Show the history of changes.

```shell
barkcli log
barkcli log --limit 10         # show last 10 entries
```

### `barkcli undo`

Revert the last change.

```shell
barkcli undo
```

---

## Task Management

Commands for managing individual tasks.

### `barkcli show <id>`

Display full details of a task.

```shell
barkcli show jwt-login
```

### `barkcli update <id>`

Update any field on a task.

```shell
barkcli update jwt-login -t "New title"
barkcli update jwt-login -p critical
barkcli update jwt-login -l backend,urgent
barkcli update jwt-login --due 2024-12-20
barkcli update jwt-login --effort 8
barkcli update jwt-login --rm-ac "old criterion"
```

### `barkcli remove <id>`

Delete a task.

```shell
barkcli remove jwt-login
```

### `barkcli comment <id> <text>`

Add a comment to a task.

```shell
barkcli comment jwt-login "Started implementation"
```

### `barkcli block <id> --on <id>`

Mark a task as blocked by another task.

```shell
barkcli block write-tests --on jwt-login
```

### `barkcli pin <id>`

Pin a task to the top of its column.

```shell
barkcli pin jwt-login
```

### `barkcli unpin <id>`

Unpin a task from the top of its column.

```shell
barkcli unpin jwt-login
```

### `barkcli remind [--hours N]`

Show cards with reminders due in the next N hours (default: 24).

```shell
barkcli remind
barkcli remind --hours 48
```

---

## Linking

Connect related tasks with typed relationships.

### `barkcli link <id> <target>`

Create a link between two tasks.

```shell
barkcli link jwt-login token-validation --as parent
barkcli link api-tests jwt-login --as child
barkcli link refactor-db api-tests --as related
barkcli link deploy staging --as blocked-by
```

**Link types:**

| Type | Description |
|---|---|
| `parent` | Target is a parent of the task |
| `child` | Target is a child of the task |
| `related` | Tasks are related |
| `blocked-by` | Task is blocked by target |

### `barkcli unlink <id> <target>`

Remove a link between tasks.

```shell
barkcli unlink jwt-login token-validation
```

### `barkcli tree`

Display the parent-child hierarchy.

```shell
barkcli tree
```

---

## Board Management

Manage multiple boards.

### `barkcli boards`

List all boards in the project.

```shell
barkcli boards
```

### `barkcli boards create <name>`

Create a new board.

```shell
barkcli boards create backend
```

### `barkcli switch <name>`

Set the default board.

```shell
barkcli switch backend
```

### `barkcli status`

Show a summary of tasks per column.

```shell
barkcli status
```

---

## Code Context

Analyze your codebase and link code to tasks.

See [Code Context Documentation](CONTEXT.md) for full details.

```shell
barkcli code <query>              # search symbols/files
barkcli context scan              # auto-map cards to code
barkcli context link <card> <path>  # pin a file to a card
barkcli context status            # coverage + staleness
barkcli context show <card>       # full context for a card
barkcli context sync              # git-aware refresh
```

---

## Sessions & Checkpoints

Capture agent sessions and save board state.

See [Advanced Documentation](ADVANCED.md) for full details.

```shell
barkcli session list              # show captured sessions
barkcli session show <id>         # full session detail
barkcli session resume <id>       # print context for agent

barkcli checkpoint list           # list checkpoints
barkcli checkpoint save [label]   # save manual checkpoint
barkcli checkpoint restore <id>   # restore from checkpoint

barkcli hooks install             # install agent hooks
barkcli hooks status              # show installed hooks
```

---

## Interfaces

Launch different UIs.

```shell
barkcli tui                        # terminal board
barkcli serve                      # web app on localhost:4321
barkcli serve --open               # open in browser
barkcli serve --port 8080          # custom port
barkcli serve --board backend      # specific board
barkcli serve --daemon             # run in background
barkcli serve --status             # show PID, port, URL
barkcli serve --stop               # graceful stop
barkcli serve --kill               # force-kill when stop hangs
barkcli serve --stop --port 3000   # kill stale server on :3000
```

---

## Pro Commands

Advanced features requiring a license.

```shell
# AI Features
barkcli ai "break down this feature"
barkcli agent propose <card-id>
barkcli agent watch --llm

# Reporting
barkcli report                     # weekly markdown report
barkcli report --sprint <name>     # sprint burndown
barkcli changelog                  # auto-generate from git
barkcli stats                      # progress analytics

# Sprints
barkcli sprint start <name> --ends 2024-12-31
barkcli sprint end <name>

# Templates
barkcli template list
barkcli template install <name>

# GitHub Sync
barkcli history scan               # group commits into bundles (read-only)
barkcli history tree                # show bundle → commit tree
barkcli history install-hooks       # install git hooks for auto-scan
barkcli bundle list                 # list bundles with filters
barkcli bundle show <id>            # bundle detail with commits
barkcli bundle approve <id>         # approve (human gate, seals bundle)
barkcli bundle seal <id>            # seal (make immutable)
barkcli bundle merge <a> <b>        # merge two bundles
barkcli bundle split <id> <sha>     # split at commit boundary
barkcli bundle export [--curated-branch <name>]  # changelog or new branch
barkcli sync --push                # push to GitHub Issues
barkcli sync --pull                # pull from GitHub Issues
```

---

## Housekeeping

Maintenance and utility commands.

```shell
barkcli validate                   # check task files
barkcli doctor                     # validate + auto-fix
barkcli export main yaml           # export board
barkcli export main json           # export as JSON
barkcli import backend tasks.yaml  # import from file
barkcli update                     # self-update
barkcli --version                  # print version
```

### `barkcli snapshot <label>`

Save a named checkpoint of the current board state.

```shell
barkcli snapshot "before-refactor"
barkcli snapshot "pre-deploy-v1.2"
```

### `barkcli blame <id>`

Show who changed a task and when.

```shell
barkcli blame jwt-login
```

### `barkcli diff`

Show what changed since the last operation.

```shell
barkcli diff
```

### `barkcli clean`

Prune orphaned context entries.

```shell
barkcli clean
```

---

## Orchestration

Commands for multi-agent workflows and task queues.

### `barkcli orchestrate start [board] [role]`

Start a continuous orchestration loop.

```shell
barkcli orchestrate start
barkcli orchestrate start main tech-lead
```

### `barkcli orchestrate cycle [board] [role]`

Run a single orchestration cycle (decompose, dispatch, monitor).

```shell
barkcli orchestrate cycle
barkcli orchestrate cycle main tech-lead
```

### `barkcli orchestrate status [board]`

Show orchestration status.

```shell
barkcli orchestrate status
```

### `barkcli listener`

Start a coding agent listener that waits for tasks.

```shell
barkcli listener
```

## Autonomy

The prompt-to-merge loop: intake → plan → spawn agent → gate → merge.

### `barkcli run "<intent>"`

Close the loop from one natural-language prompt to merged, gated code.
The task counts as done only when the project's tests pass in the worktree —
never when the agent claims success.

```shell
# Auto-detect a backend (opencode → claude → codex), plan the work,
# dispatch each task into its own worktree, run the acceptance gate,
# merge only passing branches.
barkcli run "Create a fizzbuzz module with tests" --offline --yes

# Pick a backend; custom gate command; retry ceiling.
barkcli run "Fix the flaky login test" --backend claude --test-cmd "npm test" --yes

# See the plan without creating anything.
barkcli run "Add dark mode toggle" --dry-run
```

Flags: `--backend <name>` · `--yes` (auto-merge) · `--offline` (skip LLM intake,
heuristic fallback) · `--bug` / `--feature` · `--test-cmd <cmd>` (override gate
detection) · `--max-minutes` / `--idle-minutes` / `--max-attempts` · `--no-spec`
· `--dry-run` · `--json`.

Set `BARKCLI_AGENT_CMD="<script>"` to drive tasks with any command instead of a
detected backend — the script runs inside the worktree with the prompt-file
path as `$1` (also exposed as `BARKCLI_PROMPT_FILE`).

#### Attempt telemetry

Every attempt records what it spent. Claude Code's `stream-json` result event
and Codex's `turn.completed` event both carry token counts, and Claude reports
`total_cost_usd`. The runner parses them while it tees the transcript, writes
`usage.json` next to `transcript.log`, prints a one-line summary, and rolls the
totals into both the human report (a `usage:` header line plus a `spend:` line
under each task) and `barkcli run --json`:

```json
{
  "tasks": [{ "task_id": "…", "status": "completed",
              "usage": { "input_tokens": 18400, "output_tokens": 2100,
                         "cached_input_tokens": 96000, "cost_usd": 0.0412 } }],
  "usage": { "input_tokens": 55200, "output_tokens": 6300,
             "cached_input_tokens": 288000, "cost_usd": 0.1236 },
  "cost_per_merged_change": 0.0412,
  "cost_by_backend": [{ "provider": "claude", "runs": 3, "merged": 3,
                        "cost_usd": 0.1236, "usd_per_merged_change": 0.0412 }]
}
```

Cost is cumulative *within* one process, so a single attempt keeps the peak
value from its stream; the **run** total sums the per-attempt costs, because
every attempt is its own process. Plain-text backends (OpenCode) print `usage
unavailable` rather than guessing; a wrapper script around `claude`/`codex` is
still auto-detected even though its declared stream is plain text.

A task fails the loop when: the gate fails after `--max-attempts`, the agent
crashes without producing changes (a no-op gate doesn't count), or the merge
conflicts after the final attempt. Failed attempts are recorded as project
memory facts and the verdict is injected into re-dispatch prompts.

#### Context packet

Each attempt gets a budgeted prompt instead of one unbounded concatenation.
The runner reads, in order: a managed policy (`$BARKCLI_HOME/policy.md` or
`~/.bark/policy.md`), `project_context.md`, `AGENTS.md` / `CLAUDE.md` (project
root and ancestors), `.board/rules/*.md`, and subtree rules next to the files
being touched. HTML comments are stripped. The top matching skill keeps its
full body; the rest become an index of `id — description — absolute path`, with
every body written to the session directory (never the worktree).

Budget defaults to 8k tokens (~32 KB). When it is exceeded, sections are
dropped in this order: subtree rules → skill index → extra context files →
board rules → agent files → `project_context.md`. The task, its acceptance
criteria, the branch and the retry verdict are never dropped, and the old
"prompt exceeds budget" abort is gone.

Every attempt prints a one-liner and writes `context.json` beside `prompt.md`:

```text
  · context 22.2 KB · ~5.7k tokens (ctx-287fb98e0e757786)
```

`context.json` records the packet id, byte/token counts, each section (kept or
dropped), the instruction files that were read, the skill paths and any
code-index ranges — enough to reproduce or diff a prompt after the fact.

#### Code-index evidence (LeanToken)

The packet carries *instructions*, not source. The agent reads files itself,
which is where most input tokens go. If
[LeanToken](https://github.com/morluto/leantoken) is installed, the runner asks
it one question per attempt — "which ranges does this task touch?" — and adds a
small `## Relevant code` section:

```text
## Relevant code

Ranges the code index ranked for this task. Read them before searching:

- `src/shutdown.rs:4-9` — text; symbol
- `src/executor.rs:137-147` — symbol
```

It is optional and silent:

- nothing runs unless a `leantoken` binary is on `PATH` (or `LEANTOKEN_BIN`
  points at one) — `cargo install leantoken` or `npm install --global leantoken`;
- the request has its own token budget (`code_index_budget_tokens`, default
  800) and its own drop priority, so it is trimmed like every other optional
  layer;
- pointers by default. A stale line range is harmless because the agent opens
  the file; `code_index_snippets: true` pastes the returned source instead, for
  backends that never read files;
- internal board and session artifacts (`*.board`, `.board/**`, `.agents/**`, `.claude/**`, `project_context.md`, `skills.lock`, `*.jsonl`) are automatically blacklisted from the query and filtered from returned fragments. Additional patterns can be configured with `code_index_blacklist: ["vendor/**", "*.min.js"]`;
- a missing binary, an unready index or a slow call (20s cap) drops the section
  and the attempt continues. The index is asked about the attempt's worktree, so
  its ranges match the code the agent is about to see.

`context.json` records the ranges (`code_index.fragments`), what the index left
out, and its own token accounting, so the value of the section is measurable
against the `usage.json` spend beside it.

Set `harness.context.code_index: "off"` to disable it.

#### Retry checkpoints

Before an attempt starts, the harness commits any dirty tracked files as
`bark checkpoint: <task> attempt <n>` and tags the result
`bark/try/<task>/<n>`. On a retry it resets the worktree to the **attempt-1**
tag and cleans untracked leftovers, so attempt 5 is not attempt 1 plus four
layers of noise. Set `harness.retry_reset: false` to keep the dirty branch
instead. Tags are pruned once the branch merges. A merge-conflict re-dispatch is
never rewound — its branch was recreated on the new main and rewinding would
re-introduce the conflict.

#### Lifecycle hooks

Project policy that the harness cannot know ("no merge without a changeset
entry") is configuration, not a patch to barkcli. Hooks run at:
`attempt.start`, `pre_spawn`, `post_agent`, `post_gate`, `pre_merge`,
`attempt.end`.

Each hook gets one JSON object on stdin (`event`, `task_id`, `card_id`, `title`,
`branch`, `worktree`, `attempt`, plus whatever is known at that point:
`exit_code`, `gate_ok`/`gate_cmd`/`gate_tail`, `usage`, `note`) and runs with
the worktree as its working directory. Exit **0** proceeds, **2** vetoes, and
anything else warns; `on_failure: "block"` upgrades crashes and timeouts to a
veto. A veto on `pre_merge` keeps the branch for review and records the reason
on the task; a veto on `post_gate` fails the attempt; a veto on `pre_spawn`
stops the backend before it runs. Every run is appended to `hooks.jsonl` in the
session directory.

#### Backend permissions

Permission flags are derived from config instead of hard-coded per backend:
Claude gets `--permission-mode` plus `--allowedTools` (skipped when the list is
empty), Codex gets `--sandbox`. Blank values fall back to `acceptEdits` and
`workspace-write`; OpenCode's `--auto` stays part of its recipe.

#### Run records

Every attempt writes a `RunRecord` to `.board/runs/<run_id>.json` — the same
store the web app lists in Review, Usage and the contribution graph. A
`barkcli run` is therefore visible in the browser, priced in the analytics, and
counted in `cost per merged change`, without a second history format.

Each record carries the provider, permission mode, branch, base/head SHAs, the
packet id (`context_manifest_id`, which points at `context.json`), gate
verification (`tested_head` / `target_head`), diff stats, token/cost usage and
the merge outcome (`merged`, `needs_review`, `failed`). A retry is a new record,
so old attempts stay inspectable.

#### Verifier subagent

The gate proves the tests pass; it cannot prove the diff satisfies the
acceptance criteria. Set `harness.verify.enabled` and every branch that passes
the gate and the guard is also reviewed by a **separate** process with a fresh
context — the task, its acceptance criteria, the diff and the gate tail. The
author's transcript is deliberately not passed along.

The reviewer answers with one line:

```text
VERDICT: PASS
VERDICT: FAIL — the acceptance criteria ask for a redirect test; none was added
```

A `FAIL` re-queues the task with the reviewer's reason as the retry verdict
(unless `block_on_fail: false`), and the review is recorded on the run's
contribution graph with a `verifier:` identity that can never equal the author.
An unparseable answer, a crash or a timeout is `uncertain`: it is printed and
never blocks the merge.

`harness.verify.command` is a shell command that receives the prompt on stdin
(`BARKCLI_VERIFIER_CMD` overrides it, which is how the eval suite stays
deterministic). With neither set, the run's own backend is used.

#### Spend ceiling

`harness.budget.max_run_usd` caps what one `barkcli run` may spend. The loop
checks accumulated attempt cost before dispatching the next task: at the
ceiling it stops starting new work and leaves the rest queued (in-flight
attempts always finish, so a run never strands a half-written worktree). The
report prints the ceiling, and `--json` carries it as `budget_ceiling_usd`.

The report also prints **cost per merged change**, both for the current run
(`cost_per_merged_change`) and per provider from `.board/runs`
(`cost_by_backend`), which is the number the "cheaper per merged change"
question actually needs:

```text
  cost per merged change (from .board/runs)
    claude         12 run(s), 9 merged, $0.3912 total → $0.0435/merge
```

All of it lives in `.board/config.json` (every field defaults, so older files
keep loading):

```json
{
  "version": 1,
  "harness": {
    "context": {
      "budget_tokens": 8000, "instructions": true, "skills": true, "strip_comments": true,
      "code_index": "auto", "code_index_budget_tokens": 800, "code_index_snippets": false
    },
    "retry_reset": true,
    "hooks": [
      { "event": "pre_merge", "command": "scripts/check-changeset.sh", "timeout_secs": 30, "on_failure": "block" }
    ],
    "permissions": { "mode": "acceptEdits", "allowed_tools": ["Read", "Edit", "Bash"], "sandbox": "workspace-write" },
    "verify": { "enabled": true, "timeout_secs": 180, "block_on_fail": true },
    "budget": { "max_run_usd": 5.0 }
  }
}
```

#### Parallel pool & the merge train

`--agents N` keeps up to N attempts running at once, each in its own worktree
(`bark/<task-id>`). Workers own their child process, transcript, and gate;
workers mail beats (lease refresh) and results back to the dispatcher, which
owns the queue file and all merges.

```shell
# Three tasks run concurrently; workers heartbeat the lease every 30s.
barkcli run "Ship the settings redesign" --agents 3 --yes
```

The **merge train**: each gate-passing branch merges the moment its worker
finishes — in finish order. A branch that no longer applies aborts its merge,
re-queues with the conflict verdict, and waits for the pool to drain, then
re-dispatches **solo** against a frozen main (structurally conflict-free for
that window). The report records the worker cap (`parallel`), the peak
concurrency (`workers_peak`), and the branches that landed (`merged_branches`).

Watch it live: the web app's Orchestrate view polls `/api/run/live` and shows
each running attempt as a session row (backend, task, branch, status, pulse
dot), refreshed while the run is active via WebSocket.

### `barkcli skills install <repo | id>`

Skills are markdown playbooks the loop prepends to agent prompts on trigger
matches. Install from the community registry (any github `owner/repo`, URL,
or local directory); every `*.md` is copied into `.board/skills/` and pinned
in a committed `skills.lock` (source, rev, sha256).

```shell
barkcli skills install AkshatNaruka/barkcli-skills   # community registry
barkcli skills install ./my-team-skills             # your own repo
barkcli skills lock                                 # print the pins
```

### `barkcli skills publish <id>`

Contribute a skill back: clone the registry, push a `skills/<id>` branch,
open a PR with `gh` (default registry `AkshatNaruka/barkcli-skills`;
override with `--repo` or `BARKCLI_SKILLS_REPO`).

```shell
barkcli skills publish db-index-audit
```

Legacy modes stay: `skills install <id> [--from <path>]` copies one skill
into the project; `skills list` / `skills show` browse the registry view.

---

## Trust Layer

Deterministic verification for agent work: scan the diff before merging, write
a receipt when it lands, and review in risk order. No cloud service or LLM is
in the decision path.

### `barkcli guard`

Scan a diff for secrets, dependency mistakes, missing tests, and dangerous
patterns.

```shell
barkcli guard                          # uncommitted changes (git diff HEAD)
barkcli guard --scope staged           # staged changes only
barkcli guard --branch feat/login      # branch vs the repository base branch
barkcli guard --range main...HEAD      # any git revision range
barkcli guard --checks secret,missing_tests --json
barkcli guard --strict                 # exit 1 on errors even when advisory
```

| Flag | Description |
|---|---|
| `--branch <name>` | Scan a branch against `main` / `master` / `trunk` (falls back to `HEAD` or `branch~1`) |
| `--range <rev>` | Scan an explicit range such as `main...HEAD` |
| `--scope worktree\|staged` | Select uncommitted or staged changes (default: worktree) |
| `--checks <list>` | Comma-separated subset of checks |
| `--json` | Machine-readable `GuardReport` |
| `--strict` | Promote warnings to failures; exit `1` on any error or warning |

Checks:

| Check | Severity | Catches |
|---|---|---|
| `secret` | error | API keys, tokens, private keys, high-entropy assignments |
| `undeclared_dependency` | error | Imports missing from `Cargo.toml` / `package.json` / `pyproject.toml` |
| `suspicious_dependency` | warn | Typosquat-shaped or non-registry package sources |
| `lockfile_drift` | warn | Manifest changed without its lockfile |
| `dangerous_pattern` | error | `eval`, `exec`, `shell=True`, raw SQL, TLS verification off |
| `missing_tests` | warn | Production code changed with no test change |
| `debug_leftover` | warn | `dbg!`, `console.log`, `print(` in production paths |
| `large_diff` | warn | More than 40 files or 800 changed lines |

The scan is **advisory by default**. To block merges on error findings, set:

```json
{ "guard": { "block": true } }
```

in `.board/config.json`. `guard` also works standalone in any git repository;
without `.board/` it uses defaults. Exit codes: `0` clean or advisory; `1` when
`guard.block` is on and errors exist, or when `--strict` is set and any error or
warning exists.

### `barkcli receipt`

Verifiable proof of a merge, written automatically by `barkcli run` and the web
runner to `.board/receipts/`.

```shell
barkcli receipt list [--card <id>] [--json]
barkcli receipt show <id|card> [--json]        # Markdown by default
barkcli receipt create --card <id> [--branch <b>] [--run <id>] [--json]
barkcli receipt verify <id|card> [--rerun-gate] [--json]
```

A receipt records the intent, agent and model, branch and head SHA, diff stats
and paths, gate verdict and duration, guard findings, review counts, a
confidence level with reasons, and a SHA-256 content hash. `verify` recomputes
the hash, checks whether the branch moved, and — with `--rerun-gate` — reruns
the recorded gate command.

Confidence: **High** requires a passed gate, a clean guard, changed tests, and
no open review comments. A missing gate is always **Low**; guard warnings or a
missing guard report cap it at **Medium**.

Receipts are local-first in v1 and not committed. `receipt show` renders
Markdown for sharing; the id is `rcpt_` plus 12 hex characters.

### `barkcli review queue` / `barkcli review next`

Rank cards waiting for review by risk.

```shell
barkcli review queue                 # cards in the review column
barkcli review queue --all           # include doing
barkcli review queue --limit 10 --json
barkcli review next                  # highest-risk card to open first
```

Risk combines security-sensitive paths (30), complexity (20), missing tests
(20), churn (15), public API changes (10), and size (5). Tiers: **Must** ≥ 70,
**Should** ≥ 40, **Skim** below 40, **Unknown** when no diff can be resolved.
Docs and Markdown-only changes do not score security points.

---

## Contribution Graph

Every run is a node in an always-on, Git-backed contribution DAG. Older runs
without graph metadata are read as flat result nodes.

```bash
barkcli analyze [--json]          # leading, neglected, contested, open hypotheses
barkcli contribute --title "..."  # publish an insight/hypothesis/report
  --kind hypothesis
  --text "evidence"
  --parent run_abc123
  --files src/lib.rs,README.md
barkcli link-run <child> <parent> # append a cycle-checked contribution edge
barkcli verify-run <run> --verifier reviewer  # reproduce a gate-passing run
barkcli ancestry <run>            # root-first lineage + descendants
```

- **Always on, graceful degradation.** Old run files load as result nodes.
- **Independent evidence.** A verification counts only when the verifier differs
  from the run author; self-verification is rejected.
- **Evidence score.** `ln(1 + independent verifications) + 0.5 * reuse + 0.25`
  when the gate passed.
- **Neglected branches.** Terminal nodes with no children after 24h.
- **Contested.** Nodes with both passed and failed verifications.
- **Recommendations.** UCB-style ranking across leading, neglected, contested,
  and open-hypothesis lanes.

MCP tools: `contribution_analysis`, `contribution_add`, `contribution_link`,
`contribution_verify`.

## Spec Management

Requirements traceability and specification management.

### `barkcli spec list`

List all specs.

```shell
barkcli spec list
barkcli spec list -b main  # filter by board
```

### `barkcli spec show <id>`

Show spec details.

```shell
barkcli spec show auth-spec
```

### `barkcli spec create <title>`

Create a new spec.

```shell
barkcli spec create "Authentication System" -d "JWT-based auth" -p high
```

### `barkcli spec update <id>`

Update a spec.

```shell
barkcli spec update auth-spec -s in-progress -p critical
```

### `barkcli spec delete <id>`

Delete a spec.

```shell
barkcli spec delete auth-spec
```

### `barkcli spec add-req <spec> <title>`

Add a requirement to a spec.

```shell
barkcli spec add-req auth-spec "User login"
```

### `barkcli spec link-code <spec> <req> <path>`

Link code to a requirement.

```shell
barkcli spec link-code auth-spec user-login src/auth/login.rs
```

### `barkcli spec link-task <spec> <req> <task>`

Link a task to a requirement.

```shell
barkcli spec link-task auth-spec user-login jwt-login
```

### `barkcli spec trace <id>`

Show full traceability for a spec.

```shell
barkcli spec trace auth-spec
```

### `barkcli spec coverage`

Show coverage statistics.

```shell
barkcli spec coverage
```

### `barkcli spec scan-stale <files...>`

Scan files for stale requirements.

```shell
barkcli spec scan-stale src/auth/*.rs
```

---

## Flags Reference

Common flags available across commands.

| Flag | Commands | Description |
|---|---|---|
| `-p, --priority` | add, update | `high`, `medium`, `low` |
| `-l, --label` | add, update, list | Labels (repeatable) |
| `-a, --assignee` | add, update | Person assigned |
| `-c, --column` | add, update, list | Column filter or target |
| `-t, --title` | update | New title |
| `-d, --description` | add, update | Description |
| `--due` | add, update | Due date (YYYY-MM-DD) |
| `--remind` | add, update | Reminder time |
| `--no-remind` | update | Remove reminder |
| `--effort` | add, update | Story points |
| `--area` | add, update | Area path |
| `--ac` | add, update | Acceptance criterion (repeatable) |
| `--rm-ac` | update | Remove acceptance criterion |
| `-b, --board` | any | Target a specific board |
