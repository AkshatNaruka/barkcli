# barkcli — Git-native task management

[![Version](https://img.shields.io/badge/version-0.2.0-black)](https://github.com/AkshatNaruka/barkcli/releases)

A single binary. No database. No cloud. Your tasks are YAML files committed to your repo — diff them, merge them, grep them.

```shell
curl -fsSL https://barkcli.vercel.app | sh
```

```shell
barkcli init                       # initialize in any project
barkcli add "Fix auth bug" -p high # add a task
barkcli list                       # see all tasks
barkcli move fix-auth-bug doing    # move through workflow
barkcli done fix-auth-bug          # mark as done
barkcli undo                       # revert last change
barkcli log                        # see what changed
```

---

## Install

```shell
curl -fsSL https://barkcli.vercel.app | sh

# Or build from source
cargo build --release
cp target/release/barkcli ~/.local/bin/barkcli
```

## Quick Start

```shell
barkcli init
barkcli add "JWT Login" -p high -l backend
barkcli add "OAuth Setup"
barkcli list                            # see all tasks
barkcli move jwt-login doing            # move to Doing
barkcli done jwt-login                  # shortcut for move to Done
barkcli show jwt-login                  # full card details
barkcli tui                             # interactive terminal UI
barkcli serve --open                    # browser Kanban
```

---

## Commands

### Core six

| Command | Description |
|---|---|
| `barkcli init` | Set up tracking in this project |
| `barkcli add <title>` | Add a task |
| `barkcli list` | Show tasks grouped by column |
| `barkcli move <id> <col>` | Move a task |
| `barkcli log` | See what changed |
| `barkcli undo` | Revert the last change |

### More

| Command | Description |
|---|---|
| `barkcli done <id>` | Move to done (shortcut) |
| `barkcli show <id>` | Full task detail |
| `barkcli update <id>` | Change any field |
| `barkcli remove <id>` | Delete a task |
| `barkcli comment <id> <txt>` | Add a comment |
| `barkcli block <id> --on <x>` | Mark blocked by another task |
| `barkcli diff` | See what changed |
| `barkcli blame <id>` | Who changed what, when |

### Sessions & checkpoints

Agent-session capture — sessions and auto-checkpoints are stored privately in
`.board/` (never on your git branch).

| Command | Description |
|---|---|
| `barkcli session list` | Show captured agent sessions |
| `barkcli session show <id>` | Full session detail (prompt, files, commit) |
| `barkcli session resume <id>` | Print context to hand to your agent |
| `barkcli session log` | Record a session from JSON on stdin (used by hooks) |
| `barkcli checkpoint list` | List manual + auto checkpoints |
| `barkcli checkpoint save [label]` | Save a manual checkpoint |
| `barkcli checkpoint show <id>` | Print a checkpoint |
| `barkcli checkpoint restore <id>` | Restore a board from a checkpoint |
| `barkcli hooks install [--agent opencode\|claude-code\|all]` | Install agent hooks |
| `barkcli hooks status` | Show installed agent hooks |

Secrets (API keys, tokens, credentials) are redacted to `[REDACTED]` before
anything is written to history or session logs. Auto-checkpoints are created
on every commit that touches a `.board` file.

### Interfaces

| Command | Description |
|---|---|
| `barkcli tui` | Terminal Kanban (ratatui) |
| `barkcli serve` | Browser Kanban (localhost:4321) |
| `barkcli serve --open` | Launch in default browser |

### Pro commands (license required)

| Command | Description |
|---|---|
| `barkcli ai "prompt"` | AI task breakdown (OpenAI) |
| `barkcli report` | Weekly markdown report |
| `barkcli changelog` | Auto-generate from git |
| `barkcli stats` | Progress bar + analytics |
| `barkcli template list` | Show available templates |
| `barkcli template install <name>` | Load a template |
| `barkcli sprint start <name>` | Start a sprint |
| `barkcli sprint end <name>` | End sprint, show velocity |
| `barkcli sync --push` | Push tasks to GitHub Issues |
| `barkcli sync --pull` | Pull GitHub Issues as tasks |

### Boards (optional)

| Command | Description |
|---|---|
| `barkcli boards` | List all boards |
| `barkcli boards create <name>` | Create a new board |
| `barkcli switch <name>` | Make a board the default |

### Housekeeping

| Command | Description |
|---|---|
| `barkcli status` | Summary: counts per column |
| `barkcli validate` | Check task files |
| `barkcli doctor` | Validate + auto-fix |
| `barkcli export [name] [fmt]` | Export as JSON or YAML |
| `barkcli import <name> [file]` | Import from file or stdin |
| `barkcli update` | Self-update |
| `barkcli --version` | Print version |

### Flags

| Flag | Used with | Description |
|---|---|---|
| `-p priority` | add, update | `high`, `medium`, `low` |
| `-l label` | add, update, list | Repeatable |
| `-a assignee` | add, update | Person assigned |
| `-c column` | add, update, list | Column filter or target |
| `-t title` | update | New title |
| `-d desc` | add | Description |
| `--due YYYY-MM-DD` | add | Due date |
| `-b name` | any | Target a specific board |

---

## File Format

Tasks are plain YAML committed to git:

```yaml
title: My Project
columns:
  - id: todo
    name: Todo
  - id: doing
    name: Doing
  - id: done
    name: Done
cards:
  - id: jwt-login
    title: Add JWT Login
    description: Implement JWT auth with refresh tokens
    column: doing
    priority: high
    labels: [backend, auth]
    assignee: alice
    created_at: 2026-07-30T11:00:00Z
    updated_at: 2026-07-30T14:00:00Z
```

Human-readable. Diff-friendly. Git-tracked. No lock-in.

---

## TUI Shortcuts

| Key | Action |
|---|---|
| `h`/`l` or `←`/`→` | Focus column |
| `j`/`k` or `↑`/`↓` | Select card |
| `Enter` | Card detail |
| `H`/`L` or `m` | Move card left/right |
| `a` | Add card |
| `e` | Edit card |
| `d` | Delete (confirm `y`/`n`) |
| `/` | Search/filter |
| `:` | Command palette |
| `q`/`Esc` | Quit |

---

## Design Principles

- **Offline** — no cloud, no database, no server required
- **Plain YAML** — `cat`, `grep`, `diff`, `git merge` all work
- **Single binary** — written in Rust, no runtime dependencies
- **Install in 10 seconds** — `curl \| sh` → ready
- **Works in any project** — `barkcli init` → done

---

## Pricing

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Unlimited boards, CLI, TUI, web, VS Code, git integration, history, undo |
| **Pro** | $49 one-time | AI task breakdown, reports, changelog, stats, templates, sprints, GitHub sync |

---

## Documentation

| Document | Purpose |
|---|---|
| [SPECS.md](SPECS.md) | v1.0 enhancement specs |
| [PRODUCT_SPECS.md](PRODUCT_SPECS.md) | Pro/paid feature specs (P1-P9) |
| [THEME_SPECS.md](THEME_SPECS.md) | Theme & UI specs — professional board, CLI styling |
| [SHIPPING_SPECS.md](SHIPPING_SPECS.md) | Market readiness plan |
| [LAUNCH.md](LAUNCH.md) | Launch copy for PH, HN, social |
| [MARKETING.md](MARKETING.md) | Marketing strategy, positioning, channels |
| [MANUAL.md](MANUAL.md) | Go-live checklist |
| [DESIGN.md](DESIGN.md) | Design system — colors, typography, components |

---

## License

Proprietary. All rights reserved. The barkcli CLI and VS Code extension are free to use. Pro features require a license.

