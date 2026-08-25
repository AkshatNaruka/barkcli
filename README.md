# barkcli

> Git-native project management. Tasks live in your repo.

**Open source (MIT). Built in Rust.**

## Why barkcli?

- **No cloud** — Tasks are YAML files in your repo. Work offline, commit with your code.
- **No accounts** — No sign-ups, no per-seat pricing, no vendor lock-in.
- **Git-native** — Diff tasks like code, merge with teammates, version control your project management.
- **Multi-interface** — CLI, terminal UI, web app. Same data, your choice.
- **AI-ready** — MCP server for coding agent integration (Claude, GPT, opencode).

## Install

```bash
curl -fsSL https://barkcli.vercel.app/install.sh | sh
```

Or:

```bash
brew install barkcli
cargo install barkcli
```

## Quick Start

```bash
barkcli init                           # Create .board/ in your repo
barkcli add "Build login page" -p high # Add a task
barkcli list                           # See all tasks
barkcli move build-login-page doing    # Move to column
```

## Interfaces

| Interface | Command | Description |
|-----------|---------|-------------|
| CLI | `barkcli <command>` | Full-featured command line |
| Terminal UI | `barkcli tui` | Interactive kanban in your terminal |
| Web App | `barkcli serve` | Beautiful browser UI with drag-and-drop |

## Features

- **Git-native** — Tasks are YAML files. Diff, merge, and version control them.
- **No cloud** — Works offline. No accounts, no subscriptions.
- **Multi-interface** — CLI, terminal UI, web app.
- **Code context** — Automatic call graphs, test coverage, complexity metrics.
- **AI-ready** — MCP server for coding agent integration.
- **Open source** — MIT licensed. Built in Rust.

## Documentation

| Doc | Description |
|-----|-------------|
| [Commands](docs/COMMANDS.md) | All CLI commands with examples |
| [Interfaces](docs/INTERFACES.md) | Setup guides for each interface |
| [Code Context](docs/CONTEXT.md) | Link code to tasks automatically |
| [Advanced](docs/ADVANCED.md) | Sessions, checkpoints, sprints |
| [MCP Agents](docs/MCP_AGENTS.md) | Connect coding agents via MCP |

## Architecture

```
barkcli/
├── barkcli-core/      # Core library (models, storage, commands)
├── barkcli-cli/       # CLI binary
├── barkcli-tui/       # Terminal UI
├── barkcli-server/    # Web server
├── landing-next/      # Vercel landing page
└── docs/              # Documentation
```

## Development

```bash
cargo build
cargo test
cargo run --bin barkcli-cli -- tui
cargo run --bin barkcli-cli -- serve --port 3000
```

## License

MIT — see [LICENSE](LICENSE)
