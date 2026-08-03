# barkcli — Git-native task management

[![CI](https://github.com/AkshatNaruka/barkcli/actions/workflows/ci.yml/badge.svg)](https://github.com/AkshatNaruka/barkcli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-brown)](https://github.com/AkshatNaruka/barkcli/releases)

A single binary. No database. No cloud. Your tasks are YAML files committed to your repo — diff them, merge them, grep them.

```shell
curl -fsSL https://getbarkcli.dev | sh
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
curl -fsSL https://getbarkcli.dev | sh

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

## Architecture

```
barkcli (single binary)
├── CLI   — barkcli add, list, move, undo, log, diff, blame
├── TUI   — barkcli tui (ratatui + crossterm, vim keys, themes)
├── Web   — barkcli serve (axum server + Vite/React kanban, port 4321)
└── VS Code — Custom Editor for *.board files (dnd-kit drag-and-drop)
```

All four interfaces read and write the same YAML `.board` files. No sync server needed — git is the sync mechanism.

### Workspace crates

| Crate | Purpose |
|---|---|
| `barkcli-core` | Shared library: models, storage, CLI dispatch, commands |
| `barkcli-cli` | Binary entry point + pro features (AI, reports, sprints, sync) |
| `barkcli-tui` | Terminal UI (ratatui), optional feature |
| `barkcli-server` | Axum web server + REST API + WebSocket, optional feature |
| `web/` | Vite + React + TypeScript kanban UI (served by barkcli-server) |
| `vscode-extension/` | VS Code Custom Editor extension |

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

## Building from Source

```shell
cargo build --release
cp target/release/barkcli ~/.local/bin/barkcli
```

### Running tests

```shell
cargo test
# 22 tests: 20 CLI integration + 2 slug unit tests
```

### VS Code Extension

```shell
cd vscode-extension
npm install
npm run build
# Open the folder in VS Code, press F5
```

To package for marketplace:

```shell
cd vscode-extension
npm run vscode:prepublish   # syncs web build
npx @vscode/vsce package    # creates .vsix
```

### Web UI

```shell
cd web
npm install
npm run dev        # dev server with HMR
npm run build      # production build (served by barkcli-server)
```

---

## Neovim

Add to `~/.config/nvim/after/ftplugin/board.lua`:

```lua
vim.api.nvim_create_autocmd("BufReadPre", {
  pattern = "*.board",
  callback = function()
    local buf = vim.api.nvim_create_buf(false, true)
    local w = math.floor(vim.o.columns * 0.85)
    local h = math.floor(vim.o.lines * 0.85)
    local win = vim.api.nvim_open_win(buf, true, {
      relative = "editor", width = w, height = h,
      row = math.floor((vim.o.lines - h) / 2),
      col = math.floor((vim.o.columns - w) / 2),
      style = "minimal", border = "single"
    })
    vim.fn.termopen("barkcli tui")
  end
})
```

---

## Design Principles

- **Offline** — no cloud, no database, no server required
- **Plain YAML** — `cat`, `grep`, `diff`, `git merge` all work
- **Single binary** — written in Rust, no runtime dependencies
- **One-time purchase** — pay once, use forever, no subscription
- **Install in 10 seconds** — `curl \| sh` → ready
- **Works in any project** — `barkcli init` → done

---

## Pricing

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Unlimited boards, CLI, TUI, web, VS Code, git integration, history, undo |
| **Pro** | $49 one-time | AI task breakdown, reports, changelog, stats, templates, sprints, GitHub sync |
| **Cloud Sync** | $5/user/mo (planned) | Cloud-hosted boards, team sync, activity feed |

---

## Documentation

| Document | Purpose |
|---|---|
| [SPECS.md](SPECS.md) | v1.0 enhancement specs — all features with acceptance criteria |
| [PRODUCT_SPECS.md](PRODUCT_SPECS.md) | Pro/paid feature specs (P1-P9) |
| [SHIPPING_SPECS.md](SHIPPING_SPECS.md) | Market readiness plan — Phase 1-3 with checkbox tracking |
| [LAUNCH.md](LAUNCH.md) | Launch copy — PH, HN, awesome lists, Twitter thread |
| [MARKETING.md](MARKETING.md) | Marketing plan — positioning, audience, channels, metrics |
| [MANUAL.md](MANUAL.md) | Go-live checklist — manual steps to ship |
| [DESIGN.md](DESIGN.md) | Design system — colors, typography, component patterns |
| [AGENTS.md](AGENTS.md) | AI agent instructions — codebase overview for contributors |

---

## Contributing

1. Read [AGENTS.md](AGENTS.md) for a codebase overview
2. Check [SHIPPING_SPECS.md](SHIPPING_SPECS.md) for current priorities
3. Build: `cargo build`
4. Test: `cargo test` (22 tests must pass)
5. Lint: `cargo clippy`
6. Open a PR against `master`

---

## License

MIT — see [LICENSE](LICENSE).

Your tasks stay yours. The file format is plain YAML. No lock-in, ever.
