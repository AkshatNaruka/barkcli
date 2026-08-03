# barkcli — Git-native task management

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

## Building from Source

```shell
cargo build --release
cp target/release/barkcli ~/.local/bin/barkcli
```

## VS Code Extension

Open any `.board` file in VS Code for the Kanban editor:

```shell
cd vscode-extension
npm install
npm run build
# Open the folder in VS Code, press F5
```

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

## Design

- **Offline** — no cloud, no database, no server required
- **Plain YAML** — `cat`, `grep`, `diff`, `git merge` all work
- **Single binary** — written in Rust, no runtime dependencies
- **One-time purchase** — pay once, use forever, no subscription
