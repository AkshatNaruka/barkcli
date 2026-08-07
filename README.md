# barkcli — Git-native task management

[![Version](https://img.shields.io/badge/version-0.2.0-black)](https://github.com/AkshatNaruka/barkcli/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Build](https://img.shields.io/badge/build-cargo%20test-green.svg)](#building-from-source)

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
| `barkcli link <id> <target>` | Link work items (`--as parent\|child\|related\|blocked-by`) |
| `barkcli unlink <id> <target>` | Remove a link |
| `barkcli tree` | Render parent→child hierarchy |
| `barkcli diff` | See what changed |
| `barkcli blame <id>` | Who changed what, when |

### Code context

Every card can know the code it touches — files, symbols, commit status — all
local, no LLM required. Derived data lives in `.board/context/<board>.json`.

| Command | Description |
|---|---|
| `barkcli code <query>` | Search symbols/files → linked cards |
| `barkcli context scan` | Auto-map cards to code (fuzzy symbol matching) |
| `barkcli context link <card> <path\|symbol>` | Pin a file to a card |
| `barkcli context status` | Coverage % + staleness table |
| `barkcli context show <card>` | Full code context for a card |
| `barkcli context sync` | Git-aware refresh (last commit vs dirty files) |
| `barkcli context autosync on\|off` | Post-commit context sync |
| `barkcli context refresh [id...]` | AI context refresh (Pro) |
| `barkcli agent propose <id>` | AI acceptance criteria + child tasks (Pro) |
| `barkcli agent watch [--llm]` | Watch code → keep context fresh (Pro) |
| `barkcli agent config` | Show/set AI provider (ollama, openai, lmstudio) |

### Sessions & checkpoints

Agent-session capture — sessions and auto-checkpoints are stored in
`.board/` (gitignored, never on your git branch).

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
| `barkcli report --sprint <name>` | Effort burndown for a sprint |
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
| `--remind YYYY-MM-DD[THH:MM]` | add, update | Reminder time |
| `--effort N` | add, update | Story points |
| `--area <name>` | add, update | Area path |
| `--ac <text>` | add, update | Acceptance criterion (repeatable) |
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

The terminal UI has six tabs: **Board · List · Tree · Agenda · Reports · Code**
(switch with `1`–`6` or `Tab`).

| Key | Action |
|---|---|
| `1`–`6` / `Tab` | Switch tab (Board / List / Tree / Agenda / Reports / Code) |
| `j`/`k` or `↑`/`↓` | Select card |
| `h`/`l` or `←`/`→` | Focus column (Board tab) |
| `Enter` | Card detail |
| `l` / `u` | Link / unlink a card (detail view) |
| `H`/`L` or `m` | Move card left/right |
| `a` | Add card |
| `e` | Edit card |
| `d` | Delete (confirm `y`/`n`) |
| `p`/`t`/`e`/`u` | Sort backlog by priority / title / effort / due (List tab) |
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

MIT. See [LICENSE](LICENSE). The CLI, TUI, web app and VS Code extension are
free and open source.

## Contributing

Contributions are welcome! The repo is a Cargo workspace with five crates:

- `barkcli-core` — models, storage, commands
- `barkcli-cli` — the binary (`cargo build`, `cargo test`)
- `barkcli-tui` — ratatui terminal UI
- `barkcli-server` — axum web server
- `barkcli-tui/web`, `vscode-extension` — the web app (Vite + React) and
  VS Code extension

```shell
cargo build && cargo test      # 80 tests
cd web && npm install && npm run build
cd vscode-extension && npm install && npm run build
```

Open an issue or PR on GitHub: https://github.com/AkshatNaruka/barkcli

