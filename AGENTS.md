# barkcli — Git-like Project Board Tool

> Open source (MIT). Build from source with `cargo build && cargo test`.

`barkcli` is a CLI (+ VS Code extension + web app) for task tracking inside any project. Like `.git` but for Kanban boards.

## Repository layout

```
project/
├── .board/              # Internal metadata (gitignored, auto-added)
├── *.board              # User-facing YAML board files (committed)
├── barkcli-core/        # Library: models, storage, commands (src/)
├── barkcli-cli/         # Binary: pro commands, TUI/serve dispatch
├── barkcli-tui/         # ratatui terminal kanban
├── barkcli-server/      # axum browser server
├── web/                 # React + Vite web frontend
├── vscode-extension/    # VS Code Custom Editor extension
├── landing-next/        # Next.js marketing + docs site
└── docs/                # Documentation (COMMANDS.md, INTERFACES.md, etc.)
```

## Quick Start for AI Agents

### 1. Start the Web App (recommended)

```bash
# Auto-init + start server (opens browser)
barkcli serve --open

# Start as background daemon
barkcli serve --daemon

# Check daemon status
barkcli serve --status

# Stop daemon
barkcli serve --stop
```

The web app runs on `http://localhost:4321` and provides full board management via browser.

### 2. Use the CLI directly

```bash
barkcli init                          # Set up .board/ directory
barkcli create my-board               # Create a board
barkcli my-board add "Fix login bug"  # Add a card
barkcli my-board list                 # List cards
barkcli my-board move <id> doing      # Move card to column
barkcli my-board done <id>            # Mark as done
```

### 3. Use the MCP Server (for coding agents)

```bash
barkcli mcp    # Start MCP JSON-RPC server on stdio
```

## CLI Commands

### Project commands

| Command | Description |
|---|---|
| `barkcli init` | Create `.board/` + config.json + `.gitignore` |
| `barkcli create <name>` | Create `<name>.board` YAML |
| `barkcli list` / `ls` | Table of all boards |
| `barkcli status` | Cross-board column summary |
| `barkcli validate` | Validate all `.board` files |
| `barkcli doctor` | Validate + auto-fix |
| `barkcli export <name> [json\|yaml]` | Export board to stdout |
| `barkcli import <name> [file]` | Import board from stdin/file |
| `barkcli today` | Agenda: overdue/today/next 7 days |
| `barkcli calendar [YYYY-MM]` | ASCII month calendar |

### Board card operations

```
barkcli <name> add <title>       (-d, -p, -l, -a, --column, --due)
barkcli <name> list              (-c, -p, -l filters)
barkcli <name> show <id>
barkcli <name> move <id> <col>
barkcli <name> update <id>       (-t, -d, -p, -l, -a, -c, --due)
barkcli <name> remove <id>
barkcli <name> export [format]
barkcli <name> link <id> <target> (--as parent|child|related|blocked-by)
barkcli <name> tree              (parent->child hierarchy)
```

## Web App Features

The web app (`barkcli serve`) provides a full-featured browser interface:

### Navigation Tabs

| Tab | Description |
|-----|-------------|
| **Dashboard** | Overview with stats, sprint progress, recent activity |
| **Board** | Kanban board with drag-and-drop (also table/list views) |
| **Calendar** | Cards by due date |
| **Reports** | Effort breakdown, priority stats, sprint burndown |
| **Code** | Symbol search, code-to-card mapping |
| **Activity** | History + session timeline |
| **Sprints** | Start/end sprints, sprint management |
| **Memory** | Cross-session knowledge, project facts |
| **Specs** | Specifications, requirements, traceability |
| **Orchestrate** | Agent registry, task queue, orchestration cycles |
| **Timeline** | Checkpoints, undo, diff, blame, validate/doctor, export |
| **Settings** | Board config, columns, import/export |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + Z` | Undo last change |
| `N` | New card (on Board view) |
| `?` | Show keyboard shortcuts |

### Real-time Updates

The web app uses WebSocket for live reload. All board changes are reflected instantly across browser tabs.

## Web API Reference

All endpoints require authentication when `--token` is used.

### Board Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/boards` | List all board names |
| `POST` | `/api/boards/create` | Create a new board |
| `DELETE` | `/api/boards/:name` | Delete a board |
| `GET` | `/api/board?name=` | Get board YAML |
| `PUT` | `/api/board` | Save board YAML |

### Card Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/board/cards/:id/comments` | Add comment to card |

### Memory Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/memory?name=&q=&tier=&limit=` | List/search memories |
| `POST` | `/api/memory` | Add memory entry |
| `DELETE` | `/api/memory/:id` | Delete memory |
| `GET` | `/api/memory/stats` | Memory statistics |
| `POST` | `/api/memory/fact` | Add project fact |
| `GET` | `/api/memory/facts` | List project facts |

### Specs Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/specs?name=` | List specs |
| `POST` | `/api/specs` | Create spec |
| `GET` | `/api/specs/:id` | Get spec details |
| `PUT` | `/api/specs/:id` | Update spec |
| `DELETE` | `/api/specs/:id` | Delete spec |
| `POST` | `/api/specs/:id/requirements` | Add requirement |
| `PUT` | `/api/specs/:id/requirements/:req_id` | Update requirement |
| `GET` | `/api/specs/:id/trace` | Traceability view |
| `GET` | `/api/specs/coverage` | Coverage report |
| `POST` | `/api/specs/scan-stale` | Scan for stale requirements |

### Checkpoint Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/checkpoints?name=` | List checkpoints |
| `POST` | `/api/checkpoints` | Save checkpoint |
| `POST` | `/api/checkpoints/:id/restore` | Restore checkpoint |

### Undo/Diff/Blame Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/undo` | Undo last change |
| `GET` | `/api/diff?name=` | Show diff from last state |
| `GET` | `/api/blame/:card_id` | Card change history |
| `POST` | `/api/snapshot` | Save named snapshot |

### Import/Export Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/export?name=&format=` | Export board (yaml/json) |
| `POST` | `/api/import` | Import board |

### Validate/Doctor Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/validate` | Validate all boards |
| `POST` | `/api/doctor` | Auto-fix board issues |

### Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List tasks |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `POST` | `/api/tasks/:id/claim` | Claim task for agent |
| `POST` | `/api/tasks/:id/complete` | Complete task |
| `POST` | `/api/tasks/:id/fail` | Fail task |
| `GET` | `/api/agents` | List agents |
| `POST` | `/api/agents` | Register agent |
| `GET` | `/api/agents/:id` | Get agent |
| `DELETE` | `/api/agents/:id` | Remove agent |
| `POST` | `/api/orchestrate/cycle` | Run orchestration cycle |
| `GET` | `/api/orchestrate/status` | Orchestration status |

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history` | Operation history |
| `GET` | `/api/sessions` | Agent sessions |
| `GET` | `/api/context` | Code context |
| `POST` | `/api/context/sync` | Git-aware context refresh |
| `GET` | `/api/code?q=` | Symbol search |
| `GET` | `/api/config` | AI configuration |
| `WS` | `/ws` | WebSocket for live reload |

## Daemon Management

### Starting the Daemon

```bash
# Start in background
barkcli serve --daemon

# With options
barkcli serve --daemon --port 3000 --token mysecret

# Auto-opens browser if --open is used
barkcli serve --daemon --open
```

### Managing the Daemon

```bash
# Check if running
barkcli serve --status

# Stop gracefully
barkcli serve --stop

# Force stop (if unresponsive)
kill $(cat .board/server.pid)
```

### How It Works

1. `barkcli serve --daemon` forks a background process
2. PID is written to `.board/server.pid`
3. The daemon watches board files for changes
4. WebSocket broadcasts live updates to connected browsers
5. `barkcli serve --stop` sends SIGTERM for graceful shutdown

### Auto-Init

When `barkcli serve` is run in a directory without `.board/`:
1. Creates `.board/` directory with `config.json`
2. Adds `.gitignore` for metadata files
3. Creates a default board if none exist

## Management Layer

### MCP Server for Coding Agents

```bash
barkcli mcp          # Start MCP server (JSON-RPC 2.0 over stdio)
barkcli listener     # Start coding agent listener
```

### TUI Management Tabs

| Tab | Key | Description |
|---|---|---|
| 7 Agents | `7` | View registered agents |
| 8 Orchestrate | `8` | View task queue, run cycles |

## Documentation

### For AI Agents

| Doc | Description |
|-----|-------------|
| [AI Agent Prompt](docs/AI_AGENT_PROMPT.md) | **Start here** — Copy this into your agent's context to teach it barkcli |
| [Usage Manual](docs/USAGE_MANUAL.md) | Complete how-to guide for using barkcli |

### Reference Documentation

- [Commands](docs/COMMANDS.md) — Full CLI reference
- [Interfaces](docs/INTERFACES.md) — Setup guides
- [Code Context](docs/CONTEXT.md) — Link code to tasks
- [Advanced](docs/ADVANCED.md) — Sessions, checkpoints, sprints
- [MCP Agents](docs/MCP_AGENTS.md) — Agent integration guide
- [API Reference](docs/API_REFERENCE.md) — REST API documentation
- [Web App Guide](docs/WEB_APP_GUIDE.md) — Browser interface guide
