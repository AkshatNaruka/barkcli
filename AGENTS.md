# barkcli — Git-like Project Board Tool

> Open source (MIT). Build from source with `cargo build && cargo test`.

`barkcli` is a CLI (+ VS Code extension) for task tracking inside any project. Like `.git` but for Kanban boards.

## Repository layout

```
project/
├── .board/              # Internal metadata (gitignored, auto-added)
├── *.board              # User-facing YAML board files (committed)
├── barkcli-core/        # Library: models, storage, commands (src/)
├── barkcli-cli/         # Binary: pro commands, TUI/serve dispatch
├── barkcli-tui/         # ratatui terminal kanban
├── barkcli-server/      # axum browser server
├── vscode-extension/    # VS Code Custom Editor extension
└── docs/                # Documentation (COMMANDS.md, INTERFACES.md, etc.)
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
barkcli <name> tree              (parent→child hierarchy)
```

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

- [Commands](docs/COMMANDS.md) — Full CLI reference
- [Interfaces](docs/INTERFACES.md) — Setup guides
- [Code Context](docs/CONTEXT.md) — Link code to tasks
- [Advanced](docs/ADVANCED.md) — Sessions, checkpoints, sprints
- [MCP Agents](docs/MCP_AGENTS.md) — Agent integration guide
