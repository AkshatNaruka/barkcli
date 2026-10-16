# Getting Started

Install barkcli, set up a project, and take a tour of the four surfaces: the CLI, the terminal UI, the web app, and the agent layer. This page gets you productive in about five minutes.

## Install

```bash
# One of these — npm, cargo, or the install script
npm install -g barkcli
cargo install barkcli
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/main/install.sh | sh
```

Requirements: Node.js 18+ (npm), or Rust 1.70+ (cargo), plus **git** if you want code context and History Bundles.

## Set up your first project

```bash
cd your-project        # any directory; barkcli keeps state in .board/
barkcli init           # creates .board/ + a default board: todo / doing / review / done
```

## Create some work

```bash
barkcli add "Fix login redirect" -p high --area web
barkcli add "Dark mode" -l frontend,ux --effort 3
barkcli add "Write release notes" -p low --due 2026-11-01
barkcli list
```

The core six — all you need most days: `init`, `add`, `list`, `move`, `log`, `undo`.

```bash
barkcli list doing                # cards currently in doing (-c, -l, -a filters)
barkcli move <id> in-progress     # push a card to a later column
barkcli done <id>                 # mark a card done
barkcli link <id> <target> --as parent   # child / parent / related / blocked-by
barkcli tree                      # render the parent → child tree
barkcli today                     # overdue / due-today / next-7-days agenda
barkcli log                       # who changed what, when
barkcli undo                      # revert the last change
```

Every mutation is safe by default: YAML writes are atomic and validated. Run `barkcli validate` any time; `barkcli doctor` auto-fixes what it finds.

## Pick your interface

### The web app

```bash
barkcli serve --open    # http://localhost:4321
```

Kanban with drag-and-drop, dashboards, sprints, specs, memory, orchestration, and a built-in Docs tab. Live-updates every connected tab through WebSocket. Most people run this all day and drop to the CLI for quick actions.

### The terminal UI

```bash
barkcli tui
```

A full-screen ratatui app with vim-style navigation (`j`/`k`, `h`/`l`). Number keys `1` to `9` switch tabs: `1` Board, `2` List, `3` Tree, `4` Agenda, `5` Reports, `6` Code, `7` Agents, `8` Orchestrate, `9` History. Press `T` to cycle themes (Dark → Light → Minimal), `/` to filter, `:` for the command palette. See the [TUI guide](/docs/TUI) for the complete shortcut map.

### AI agents / editors

```bash
barkcli mcp            # Model Context Protocol server for editors + agents
barkcli hooks install  # capture sessions from opencode / claude-code
```

Point Claude Code, Cursor, Codex, or any MCP client at `barkcli mcp`. `barkcli intake "bug text"` classifies input into a card + spec, `barkcli plan <card-id>` decomposes it, and `barkcli dispatch` runs the orchestration cycle that assigns queued tasks to registered agents.

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
