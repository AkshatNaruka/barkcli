# Commands Reference

Complete reference for all barkcli commands.

## Table of Contents

- [Core Commands](#core-commands)
- [Task Management](#task-management)
- [Board Management](#board-management)
- [Code Context](#code-context)
- [Sessions & Checkpoints](#sessions--checkpoints)
- [Interfaces](#interfaces)
- [Pro Commands](#pro-commands)
- [Housekeeping](#housekeeping)
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
barkcli tui                        # terminal kanban board
barkcli serve                      # web app on localhost:4321
barkcli serve --open               # open in browser
barkcli serve --port 8080          # custom port
barkcli serve --board backend      # specific board
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
