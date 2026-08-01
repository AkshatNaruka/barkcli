# Board — Git-like Task Management

> A single binary. No database. No cloud. Works offline.
> Like `.git` but for Kanban boards — committed YAML files you can diff, merge, and grep.

[**Website**](https://get.board.io) · [GitHub](https://github.com/anomalyco/board)

```shell
curl -fsSL https://get.board.io | sh   # install in 10 seconds
```

```shell
board init                        # initialize in any project
board add "Fix auth bug" -p high  # add a task
board list                        # see all tasks
board move fix-auth-bug doing     # move through workflow
board done fix-auth-bug           # mark as done
board undo                        # revert last change
```

---

## Quick Start

### 1. Install

```shell
# One-command install
curl -fsSL https://raw.githubusercontent.com/anomalyco/board/main/install.sh | sh

# Or from source
git clone https://github.com/anomalyco/board
cd board
cargo build --release
cp target/release/board ~/bin/board
```

### 2. Initialize in any project

```shell
cd my-project
board init
```

This creates `.board/` (internal metadata, added to `.gitignore`) and is all you need.

### 3. Create a board

```shell
board create sprint-1
```

Creates `sprint-1.board` — a YAML file you commit to git.

### 4. Add and move cards

```shell
board sprint-1 add "JWT Login" -p high -l backend -a alice
board sprint-1 add "OAuth Setup" -d "Implement OAuth 2.0 flow" -p medium
board sprint-1 list                    # see all cards
board sprint-1 move jwt-login doing    # move to "Doing"
board sprint-1 status jwt-login done   # quick status transition
board sprint-1 show jwt-login          # full card details
board sprint-1 remove oauth-setup      # delete card
```

### 5. Interactive UI

```shell
board sprint-1 tui            # Terminal Kanban (ratatui)
board sprint-1 serve --open   # Browser Kanban (hot-reloads on file changes)
board tui                     # Auto-detect board and open TUI
board open                    # TUI if terminal, browser otherwise
```

---

## Commands

### Project-level

| Command | Description |
|---|---|
| `board init` | Initialize `.board/` + `config.json` + `.gitignore` |
| `board create <name>` | Create a new `<name>.board` YAML file |
| `board list` | Table of all boards |
| `board status` | Cross-board column summary |
| `board validate` | Validate all `.board` files (exits 1 on error) |
| `board doctor` | Validate + auto-fix missing fields |
| `board clean` | Remove stale locks + orphaned history |
| `board export <name> [json\|yaml]` | Export board to stdout |
| `board import <name> [file]` | Import board from stdin or file |
| `board tui [name]` | Open interactive terminal Kanban UI (ratatui) |
| `board serve [--port N] [--board name] [--open]` | Start local Kanban web UI server |
| `board open [name]` | Open board (TUI if terminal, browser if piped) |

### Card operations

```
board <name> add <title>       (-d, -p, -l, -a, --column)
board <name> list              (-c, -p, -l filters)
board <name> show <id>
board <name> move <id> <col>
board <name> status <id> <col> (quick alias for move)
board <name> update <id>       (-t, -d, -p, -l, -a, -c)
board <name> remove <id>
board <name> export [format]
```

### Flags reference

| Flag | Used with | Description |
|---|---|---|
| `-d` / `--description` | add, update | Card description |
| `-p` / `--priority` | add, update | `high`, `medium`, `low` |
| `-l` / `--label` | add, update, list | Label (repeatable: `-l backend -l auth`) |
| `-a` / `--assignee` | add, update | Assignee name |
| `-c` / `--column` | add, update, list | Column filter or target |
| `-t` / `--title` | update | New title |

### TUI keyboard shortcuts

| Key | Action |
|---|---|
| `←`/`→` or `h`/`l` | Focus column |
| `↑`/`↓` or `j`/`k` | Select card |
| `Enter` | Card detail panel |
| `H`/`L` or `m` | Move card left/right |
| `a` | Add card |
| `e` | Edit selected card |
| `d` | Delete card (confirm with `y`/`n`) |
| `/` | Search/filter by text, label, or assignee |
| `q` / `Esc` | Quit (Esc closes panel first if open) |

---

## Board File Format

Each board is a plain YAML file committed to git:

```yaml
title: Authentication
columns:
  - id: todo
    name: Todo
  - id: doing
    name: Doing
  - id: review
    name: Review
  - id: done
    name: Done

cards:
  - id: jwt-login
    title: Add JWT Login
    description: Implement JWT auth with refresh tokens
    column: todo
    priority: high
    labels: [backend, auth]
    assignee: alice
    checklist:
      - text: Design token flow
        done: true
    created_at: 2026-07-30T11:00:00Z
    updated_at: 2026-07-30T14:00:00Z
```

Human-readable. Easy to diff. Easy to merge.

```diff
-column: todo
+column: done
```

---

## VS Code Extension

Open any `.board` file → VS Code launches a Kanban editor automatically.

Build + run:

```shell
cd vscode-extension
npm install
npm run build
# Open the folder in VS Code, press F5
```

---

## Neovim Integration

Add to `~/.config/nvim/after/ftplugin/board.lua`:

```lua
vim.api.nvim_create_autocmd("BufReadPre", {
  pattern = "*.board",
  callback = function()
    local buf = vim.api.nvim_create_buf(false, true)
    local width = math.floor(vim.o.columns * 0.85)
    local height = math.floor(vim.o.lines * 0.85)
    local win = vim.api.nvim_open_win(buf, true, {
      relative = "editor",
      width = width, height = height,
      row = math.floor((vim.o.lines - height) / 2),
      col = math.floor((vim.o.columns - width) / 2),
      style = "minimal", border = "single"
    })
    vim.fn.termopen("board " .. vim.fn.expand("%:t:r") .. " tui")
  end
})
```

Set `vim.g.board_backend = "browser"` to use `board serve --open` instead.

---

## JetBrains Integration

Minimal IntelliJ Platform Plugin setup:

1. Create a new IntelliJ Platform Plugin project
2. Register `*.board` file type in `plugin.xml`:
   ```xml
   <fileType name="Board" implementationClass="BoardFileType"
             extensions="board" fieldName="INSTANCE"/>
   ```
3. Create `BoardEditorProvider.kt` that:
   - On open, runs `board serve --port 4321` as a background process
   - Opens a JCEF browser panel at `http://localhost:4321`
   - Kills the server process when the project closes
4. Build with Gradle and install

---

## OS File Association

Register `board open <file>` as the default handler for `.board` files:

**macOS**: Use `duti` or configure `LSHandlers` in `Info.plist`:
```shell
duti -s board board open all
```

**Linux**: Create a `.desktop` file and update `xdg-mime`:
```shell
xdg-mime default board.desktop text/board
```

**Windows**: Use `ftype` and `assoc`:
```cmd
assoc .board=BoardFile
ftype BoardFile=board open "%1"
```

---

## Building from Source

### CLI

```shell
cargo build --release
# Binary at target/release/board
```

### Extension

```shell
cd vscode-extension
npm install
npm run build
# Output: dist/extension.js, dist/webview.js, dist/webview.css
```

---

## Design

- **Local-first** — works offline, no server, no cloud
- **File-based** — plain YAML, `cat`, `diff`, `grep` all work
- **Version-controlled** — commit `.board` files, git tracks everything
- **Zero config** — `board init` is all you need
- **Fast** — Rust CLI, no database, no HTTP calls

---

## This Project's Board

This repo uses `board` to track its own development:

```shell
board dev list        # see all planned features
board dev list -c doing   # what's being worked on
board status          # overall project status
board dev show vs-code-extension  # details on a card
```
