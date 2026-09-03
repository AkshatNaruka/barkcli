# barkcli

> Git-native project management with an AI agent layer. Tasks live in your repo.

**Open source (MIT). Built in Rust.**

## Why barkcli?

- **No cloud** — Tasks are YAML files in your repo. Work offline, commit with your code.
- **No accounts** — No sign-ups, no per-seat pricing, no vendor lock-in.
- **Git-native** — Diff tasks like code, merge with teammates, version control your project management.
- **Multi-interface** — CLI, terminal UI, web app, VS Code extension. Same data, your choice.
- **AI agent layer** — Intake → spec → decompose → dispatch → code → review. All automated.

## Install

```bash
# macOS / Linux
curl -fsSL https://barkcli.vercel.app/install.sh | sh

# Homebrew
brew install AkshatNaruka/barkcli/barkcli

# Cargo
cargo install barkcli

# Windows
irm https://barkcli.vercel.app/install.ps1 | iex
```

Binary downloads: [GitHub Releases](https://github.com/AkshatNaruka/barkcli/releases)

## Quick Start

```bash
barkcli init                           # Create .board/ in your repo
barkcli add "Build login page" -p high # Add a task
barkcli list                           # See all tasks
barkcli move build-login-page doing    # Start working
```

## Interfaces

| Interface | Command | Description |
|-----------|---------|-------------|
| CLI | `barkcli <command>` | Full-featured command line |
| Terminal UI | `barkcli tui` | Interactive kanban in your terminal |
| Web App | `barkcli serve` | Browser UI with drag-and-drop |
| VS Code | `barkcli vscode-install` | Custom editor for `.board` files |

## AI Agent Layer

The management layer sits between humans and coding agents, handling the full lifecycle.

```bash
# 1. Human input → structured card + spec
barkcli intake "Add Google OAuth login" --feature

# 2. Card → requirements + child tasks
barkcli plan oauth-login --tasks

# 3. Dispatch tasks to agents
barkcli monitor              # See agent status and task queue
barkcli review --all         # Validate completed work

# 4. Cross-session memory
barkcli memory add "project uses axum for HTTP" --tier long
barkcli memory search "error handling patterns"
```

### Pipeline

```
Human → intake → plan → dispatch → coding agent → review → done
         ↕ skills (mvp/planning/scrum-master/test) → mind → overview
```

### Supported Agents

- **OpenCode** — auto-detected, invoked via subprocess
- **Claude Code** — auto-detected, invoked via subprocess
- **Any MCP agent** — via `barkcli mcp` (38 tools: board/card/task/agent/context/memory/mind/skills/intake)

## Core Commands

| Command | Description |
|---------|-------------|
| `barkcli init` | Set up task tracking |
| `barkcli add <title>` | Add a task (`-p`, `-l`, `-a`, `--due`) |
| `barkcli list` | View all tasks |
| `barkcli move <id> <col>` | Move task between columns |
| `barkcli done <id>` | Mark task complete |
| `barkcli today` | Agenda: overdue, today, next 7 days |
| `barkcli calendar` | ASCII month calendar |

### Management Commands

| Command | Description |
|---------|-------------|
| `barkcli intake <text>` | Classify input → card + spec (offline heuristic if no LLM) |
| `barkcli plan <card-id>` | Generate spec + decomposition |
| `barkcli mind sync\|show` | Compile + show Mind snapshot/digest |
| `barkcli overview` | 4-panel human narrative (board/sprint/blockers/next) |
| `barkcli skills list\|show` | BMAD skills: mvp/planning/scrum-master/test |
| `barkcli dispatch` | Run orchestration cycle (assign tasks) |
| `barkcli monitor` | Dashboard: agents, tasks, insights |
| `barkcli review [card-id]` | Validate completed work |
| `barkcli memory <cmd>` | Cross-session memory (add/search/list) |

### Agent Commands

| Command | Description |
|---------|-------------|
| `barkcli mcp` | Start MCP server (38 tools) |
| `barkcli listener` | Poll for tasks and execute them (injects skills) |
| `barkcli orchestrate cycle` | Run orchestration cycle (= `dispatch`) |
| `barkcli hooks install` | Install agent hooks (opencode/claude-code) |

### Project Commands

| Command | Description |
|---------|-------------|
| `barkcli validate` | Check task files |
| `barkcli doctor` | Validate + auto-fix |
| `barkcli export <name>` | Export board (json/yaml) |
| `barkcli import <name>` | Import board |
| `barkcli context scan` | Map cards to code files |
| `barkcli spec create <title>` | Create a specification |

## Memory System

Four-tier memory for cross-session learning:

| Tier | Max | Purpose |
|------|-----|---------|
| Working | 20 | Current card, task context |
| Short-term | 100 | Session decisions, files touched |
| Long-term | 500 | Code patterns, conventions |
| External | 10,000 | All past sessions, searchable archive |

```bash
barkcli memory add "convention: use Result<T> for public APIs" --tier long --tags convention
barkcli memory search "error handling"
barkcli memory compress   # short-term → long-term
barkcli memory stats
```

## Documentation

| Doc | Description |
|-----|-------------|
| [AI Agent Prompt](docs/AI_AGENT_PROMPT.md) | Copy into your agent's context |
| [Usage Manual](docs/USAGE_MANUAL.md) | Complete how-to guide |
| [Commands](docs/COMMANDS.md) | Full CLI reference |
| [Interfaces](docs/INTERFACES.md) | Setup guides |
| [Management Layer Vision](MANAGEMENT_LAYER_VISION.md) | `v0.3.0-mvp` mind+skills+hardening |
| [MVP Specs](specs/) | SPEC-001..004 + MVP-PLAN (solo-first, same branch) |

## Architecture

```
barkcli/
├── barkcli-core/       # Core library (models, storage, commands, memory, agent)
├── barkcli-cli/        # CLI binary + listener
├── barkcli-tui/        # Terminal UI (ratatui)
├── barkcli-server/     # Web server (axum)
├── vscode-extension/   # VS Code custom editor
├── web/                # Web frontend (Vite + React)
└── landing-next/       # Landing page (Next.js)
```

## Development

```bash
cargo build
cargo test
cargo run -- tui
cargo run -- serve --port 3000
```

## License

MIT — see [LICENSE](LICENSE)
