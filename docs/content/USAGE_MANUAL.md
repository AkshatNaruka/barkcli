# barkcli Usage Manual

A complete guide to using barkcli for project management.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Setup](#project-setup)
3. [Managing Tasks](#managing-tasks)
4. [Working with Boards](#working-with-boards)
5. [Code Context](#code-context)
6. [Task Relationships](#task-relationships)
7. [Interfaces](#interfaces)
8. [AI Agent Integration](#ai-agent-integration)
9. [Advanced Features](#advanced-features)
10. [Tips and Tricks](#tips-and-tricks)

---

## Getting Started

### What is barkcli?

barkcli is a git-native project management tool. Tasks live in your repository as YAML files — no cloud, no accounts, no vendor lock-in.

### Installation

**macOS / Linux (one-liner):**
```bash
curl -fsSL https://barkcli.vercel.app/install.sh | sh
```

**Homebrew:**
```bash
brew tap AkshatNaruka/barkcli
brew install barkcli
```

**Cargo:**
```bash
cargo install barkcli
```

**Windows (PowerShell):**
```powershell
irm https://barkcli.vercel.app/install.ps1 | iex
```

### Verify Installation

```bash
barkcli --version
```

---

## Project Setup

### Initialize barkcli

Navigate to your project root and initialize:

```bash
cd your-project
barkcli init
```

This creates:
- `.board/` directory with configuration
- `.board/config.json` — project settings
- `.board/.gitignore` — keeps internal files out of git

### Create Your First Board

```bash
barkcli create main
```

This creates `main.board` — a YAML file where your tasks live.

### Default Columns

Every board starts with 4 columns:
- **todo** — Tasks to do
- **doing** — Tasks in progress
- **review** — Tasks being reviewed
- **done** — Completed tasks

---

## Managing Tasks

### Adding Tasks

**Basic task:**
```bash
barkcli add "Implement user login"
```

**With options:**
```bash
barkcli add "Fix authentication bug" \
  -p high \
  -l backend,auth \
  -a alice \
  -d "Users cannot login with email" \
  --due 2024-12-15 \
  --effort 5 \
  --ac "Login with email works" \
  --ac "Error messages are clear"
```

**Flag reference:**
| Flag | Description |
|------|-------------|
| `-p` | Priority: high, medium, low |
| `-l` | Labels (comma-separated) |
| `-a` | Assignee |
| `-d` | Description |
| `--due` | Due date (YYYY-MM-DD) |
| `--effort` | Story points |
| `--ac` | Acceptance criteria (repeatable) |
| `--column` | Target column |

### Viewing Tasks

**List all tasks:**
```bash
barkcli list
```

**Filter by column:**
```bash
barkcli list -c todo
barkcli list -c doing
```

**Filter by priority:**
```bash
barkcli list -p high
```

**Filter by label:**
```bash
barkcli list -l backend
```

**Show task details:**
```bash
barkcli show fix-auth-bug
```

### Updating Tasks

**Move to different column:**
```bash
barkcli move fix-auth-bug doing
barkcli move fix-auth-bug review
barkcli move fix-auth-bug done
```

**Quick complete (move to done):**
```bash
barkcli done fix-auth-bug
```

**Update fields:**
```bash
barkcli update fix-auth-bug -t "New title"
barkcli update fix-auth-bug -p critical
barkcli update fix-auth-bug -l backend,urgent
barkcli update fix-auth-bug --due 2024-12-20
barkcli update fix-auth-bug --effort 8
```

**Add comment:**
```bash
barkcli comment fix-auth-bug "Started implementation"
```

**Mark as blocked:**
```bash
barkcli block write-tests --on fix-auth-bug
```

**Pin to top:**
```bash
barkcli pin fix-auth-bug
barkcli unpin fix-auth-bug
```

### Deleting Tasks

```bash
barkcli remove fix-auth-bug
```

---

## Working with Boards

### List All Boards

```bash
barkcli boards
```

### Create New Board

```bash
barkcli boards create frontend
```

### Switch Default Board

```bash
barkcli switch frontend
```

### Cross-Board Status

```bash
barkcli status
```

### Export Board

```bash
barkcli export main yaml
barkcli export main json
```

### Import Board

```bash
barkcli import backend tasks.yaml
```

### Validate Board

```bash
barkcli validate
barkcli doctor  # validate + auto-fix
```

---

## Code Context

Link your tasks to actual code files.

### Scan Codebase

```bash
barkcli context scan
```

This automatically maps card titles to code files using fuzzy matching.

### Search Code

```bash
barkcli code "login"
barkcli code "UserService"
barkcli code "src/api"
```

### Link Code to Task

```bash
barkcli context link fix-auth-bug src/auth/login.ts
barkcli context link fix-auth-bug UserService
```

### View Task Context

```bash
barkcli context show fix-auth-bug
```

### Check Coverage

```bash
barkcli context status
```

### Sync with Git

```bash
barkcli context sync
```

---

## Task Relationships

### Link Tasks

```bash
# Parent-child relationship
barkcli link implement-login user-registration --as parent
barkcli link user-registration implement-login --as child

# Related tasks
barkcli link refactor-db add-index --as related

# Blocked by
barkcli link deploy-staging run-tests --as blocked-by
```

### View Hierarchy

```bash
barkcli tree
```

### Remove Link

```bash
barkcli unlink implement-login user-registration
```

---

## Interfaces

### Terminal UI (TUI)

Interactive kanban board in your terminal:

```bash
barkcli tui
```

**Keyboard shortcuts:**
- `h`/`l` or arrows: Navigate columns
- `j`/`k` or arrows: Select card
- `Enter`: View details
- `a`: Add card
- `e`: Edit card
- `d`: Delete card
- `H`/`L` or `m`: Move card
- `/`: Search
- `:`: Command palette
- `T`: Toggle theme
- `1`-`8`: Switch tabs

### Web App

Beautiful browser UI with drag-and-drop:

```bash
barkcli serve              # localhost:4321
barkcli serve --open       # open in browser
barkcli serve --port 8080  # custom port
barkcli serve --board backend  # specific board
```

**Web features:**
- Drag-and-drop kanban
- Table view with filters
- Calendar view
- Activity timeline
- Dark/light mode
- Command palette (Cmd+K)

---

## AI Agent Integration

### MCP Server

Start the MCP server for coding agent integration:

```bash
barkcli mcp
```

### Configure Agent

Add to your agent's MCP configuration:

```json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
```

### Agent Listener

Start a listener that waits for tasks:

```bash
barkcli listener
```

### Orchestration

```bash
barkcli orchestrate start     # Start continuous loop
barkcli orchestrate cycle     # Run single cycle
barkcli orchestrate status    # Show status
```

---

## Advanced Features

### Sessions

Capture and resume agent sessions:

```bash
barkcli session list
barkcli session show <id>
barkcli session resume <id>
```

### Checkpoints

Save and restore board state:

```bash
barkcli snapshot "before-refactor"
barkcli checkpoint list
barkcli checkpoint save "pre-deploy"
barkcli checkpoint restore <id>
```

### History

View change history:

```bash
barkcli log
barkcli log --limit 10
```

### Undo

Revert last change:

```bash
barkcli undo
```

### Today's Agenda

```bash
barkcli today
barkcli calendar
barkcli calendar 2024-12
```

### Agent Hooks

Install hooks for automatic behavior:

```bash
barkcli hooks install
barkcli hooks status
```

---

## Tips and Tricks

### Quick Task Creation

```bash
# Simple task
barkcli add "Fix bug"

# Quick priority
barkcli add "Critical fix" -p high

# With deadline
barkcli add "Release" --due 2024-12-31
```

### Batch Operations

```bash
# List all high priority tasks
barkcli list -p high

# List all tasks in doing
barkcli list -c doing

# List all tasks with label
barkcli list -l backend
```

### Keyboard Shortcuts in TUI

| Key | Action |
|-----|--------|
| `a` | Add card |
| `e` | Edit card |
| `d` | Delete card |
| `m` | Move card |
| `/` | Search |
| `T` | Toggle theme |
| `1`-`8` | Switch tabs |

### Web App Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+N` | New card |
| `Esc` | Close modal |

### Useful Aliases

Add to your shell profile:

```bash
alias bs="barkcli status"
alias bl="barkcli list"
alias ba="barkcli add"
alias bd="barkcli done"
alias bt="barkcli tui"
alias bw="barkcli serve"
```

### Git Integration

barkcli works with git:

```bash
# Commit your board
git add *.board
git commit -m "Update tasks"

# Branch and work on features
git checkout -b feature/login
barkcli add "Implement login" -p high
# ... work ...
barkcli done implement-login
git commit -am "Complete login feature"

# Merge back
git checkout main
git merge feature/login
```

### CI/CD Integration

Validate boards in CI:

```bash
# .github/workflows/ci.yml
- name: Validate boards
  run: barkcli validate
```

---

## Command Quick Reference

### View
```bash
barkcli list                    # All tasks
barkcli list -c todo            # Todo only
barkcli list -p high            # High priority
barkcli show <id>               # Task details
barkcli status                  # Board summary
```

### Add
```bash
barkcli add "Title"             # Simple
barkcli add "Title" -p high     # With priority
barkcli add "Title" --due DATE  # With deadline
```

### Update
```bash
barkcli move <id> <col>         # Move task
barkcli done <id>               # Mark done
barkcli comment <id> "text"     # Add comment
barkcli update <id> -p high     # Update field
```

### Code
```bash
barkcli code "search"           # Search code
barkcli context scan            # Auto-map
barkcli context show <id>       # Card context
```

### Board
```bash
barkcli boards                  # List boards
barkcli create <name>           # New board
barkcli switch <name>           # Switch board
```

---

## Getting Help

```bash
barkcli --help                  # General help
barkcli add --help              # Command-specific help
barkcli list --help             # List options
```

---

## Additional Documentation

- [Commands Reference](COMMANDS.md) — Full CLI reference
- [Interfaces](INTERFACES.md) — TUI, Web, VS Code setup
- [Code Context](CONTEXT.md) — Link code to tasks
- [Advanced](ADVANCED.md) — Sessions, checkpoints, sprints
- [MCP Agents](MCP_AGENTS.md) — Agent integration guide
- [AI Agent Prompt](AI_AGENT_PROMPT.md) — Prompt for AI agents
