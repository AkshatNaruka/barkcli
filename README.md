# barkcli

> Git-native project management. Tasks live in your repo.

**Open source (MIT). Built in Rust.**

## What is barkcli?

barkcli is a CLI + web app for task tracking inside any project. Tasks are YAML files in your repo — diff them, merge them, grep them. No cloud, no accounts, no vendor lock-in.

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
| VS Code | Extension | Manage tasks inside your editor |

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
