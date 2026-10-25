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

A task fails the loop when: the gate fails after `--max-attempts`, the agent
crashes without producing changes (a no-op gate doesn't count), or the merge
conflicts after the final attempt. Failed attempts are recorded as project
memory facts and the verdict is injected into re-dispatch prompts.

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
