# Board — Git-like Project Board Tool

`board` is a CLI (+ VS Code extension) for task tracking inside any project. Like `.git` but for Kanban boards.

```shell
board init          # Initialize board tracking in this project
board create dev    # Create a new board
board dev add "Fix auth bug" -p high -l backend
board dev move fix-auth-bug doing
board status        # See all boards at a glance
```

---

## Quick Start

### 1. Install

```shell
git clone <this-repo>
cd board
cargo build --release
cp target/release/board ~/bin/board   # or anywhere on $PATH
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
