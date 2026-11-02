# Getting Started

Install barkcli, set up a project, and take a tour of the five surfaces: the CLI, the terminal UI, the web app, the native macOS app, and the autonomous agent layer. This guide gets you productive in under 3 minutes.

## 1. Install

```bash
# macOS & Linux (recommended one-liner)
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/main/install.sh | sh

# macOS Desktop App (Bark.app)
curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install-app.sh | sh

# Via Cargo (Rust 1.75+)
cargo install barkcli

# Via npm
npm install -g barkcli
```

## 2. Set Up Your Repo & Living Context

```bash
cd your-project        # any git repository
barkcli init           # creates .board/, config, and default board
barkcli context prime  # bootstrap project_context.md living context file
```

## 3. The 60-Second Autonomous Run

Let AI agents work for you with deterministic test acceptance gates:

```bash
# Decompose intent -> spawn 3 parallel worktrees -> test gates -> merge train
barkcli run "Implement rate limiting middleware and unit tests" --agents 3 --yes
```

- **Isolated Worktrees**: Agents operate on isolated git branches without touching your uncommitted edits.
- **Acceptance Gate**: barkcli runs your project's test suite inside each worktree.
- **Merge Train**: Passing branches merge automatically in completion order.

## 4. Pick Your Interface

### The Native macOS App
Launch `/Applications/Bark.app` for high-performance offline desktop usage.

### The Web App
```bash
barkcli serve --open    # opens http://localhost:4321
```
Kanban with drag-and-drop, dashboards, sprints, specs, collective memory, orchestration, living context editor, and built-in Docs. Live-updates across all browser tabs via WebSockets.

### The Terminal UI (TUI)
```bash
barkcli tui
```
Full-screen `ratatui` terminal interface with vim-style keybindings (`j`/`k`, `h`/`l`). Number keys `1`–`9` switch views: Board, List, Tree, Agenda, Reports, Code, Agents, Orchestrate, History.

### AI Coding Agents & MCP
```bash
barkcli mcp            # Model Context Protocol server (76 tools for Claude Code, Cursor, OpenCode)
```

Point Claude Code or Cursor at `barkcli mcp` to let agents read tasks, claim work, inspect memory gotchas, and report status.

## 5. Everyday CLI Commands

```bash
barkcli add "Fix login redirect" -p high --area web
barkcli list doing                # filter cards
barkcli move <id> in-progress     # advance column
barkcli guard                     # deterministic pre-merge security & test scan
barkcli receipt show <id>         # audit cryptographic execution proof
barkcli done <id>                 # mark card done
barkcli undo                      # rollback last mutation
```

## 6. Living Context & Memory

- `barkcli context digest` — refreshes `project_context.md` with git changes, board status, and symbols.
- `barkcli memory add "gotcha: always run migrations before tests"` — stores cross-session knowledge in persistent long-term memory.

## Add History Bundles (optional, one command)

```bash
barkcli history scan      # group recent git commits into bundles (read-only)
barkcli bundle list       # curated view: names, commits, +/- diff stats
barkcli history validate  # consistency check
```

barkcli reads your git log (never rewrites/amends/rebases anything) and groups commits into named bundles you can curate, export to a branch, or leave as a readable log of *why* changes shipped.

## Useful next commands

| Command | What it does |
|---------|--------------|
| `barkcli status` | Quick counts per column |
| `barkcli overview` | Human-readable narrative of board, sprint, blockers, next up |
| `barkcli mind sync` | Compile a cross-board "Mind" snapshot for agents |
| `barkcli serve --daemon` | Run the web app in the background |
| `barkcli update` | Self-update |

## Where to next

| Path | Doc |
|------|-----|
| Keyboard-first workflow | [TUI.md](/docs/TUI) |
| Every command flag | [COMMANDS.md](/docs/COMMANDS) |
| Web app deep dive | [WEB_APP_GUIDE.md](/docs/WEB_APP_GUIDE) |
| Hook up an agent | [MCP_AGENTS.md](/docs/MCP_AGENTS) |
| History Bundles | [HISTORY.md](/docs/HISTORY) |
| Full manual | [USAGE_MANUAL.md](/docs/USAGE_MANUAL) |
