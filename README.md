# barkcli

[![Version](https://img.shields.io/badge/version-0.2.0-black)](https://github.com/AkshatNaruka/barkcli/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Build](https://img.shields.io/badge/build-cargo%20test-green.svg)](#building-from-source)

**Git-native task management.** A single binary. No database. No cloud. Your tasks are YAML files committed to your repo.

```
┌─────────────────────────────────────────────────────────┐
│ Todo              Doing               Done              │
├─────────────────────────────────────────────────────────┤
│ ● Fix login bug   ● Implement API    ✓ Setup CI/CD     │
│ ● Write docs      ● Add auth         ✓ Init project    │
│                   ● Refactor DB                        │
└─────────────────────────────────────────────────────────┘
```

---

## Install

```shell
curl -fsSL https://barkcli.vercel.app | sh
```

Or build from source:

```shell
cargo install barkcli
```

---

## Quick Start

```shell
barkcli init                           # set up in any project
barkcli add "Fix auth bug" -p high     # add a task
barkcli list                           # see all tasks
```

That's it. Your tasks are now YAML files in `.board/` — commit them with your code.

---

## Features

| Feature | Description |
|---|---|
| **Git-Native** | Tasks are YAML files. `git diff`, `git merge`, `git grep` all work. |
| **No Cloud** | Works offline. No accounts, no subscriptions, no vendor lock-in. |
| **Multi-Interface** | CLI, terminal UI, web app, VS Code extension — same data. |
| **Code Context** | Automatic code analysis with call graphs and test coverage. |
| **AI-Ready** | MCP server for coding agent integration. |
| **Open Source** | MIT licensed. Built in Rust. |

---

## Interfaces

| Interface | Command | Description |
|---|---|---|
| **CLI** | `barkcli <command>` | Full-featured command line |
| **Terminal UI** | `barkcli tui` | Interactive kanban in your terminal |
| **Web App** | `barkcli serve` | Browser-based kanban board |
| **VS Code** | Install extension | Custom editor for `.board` files |

---

## Documentation

| Document | Description |
|---|---|
| [**Commands**](docs/COMMANDS.md) | Complete command reference |
| [**Interfaces**](docs/INTERFACES.md) | TUI, Web App, and VS Code guides |
| [**Code Context**](docs/CONTEXT.md) | Code analysis and AI features |
| [**Advanced**](docs/ADVANCED.md) | Sessions, checkpoints, Pro features |

---

## File Format

Tasks are plain YAML committed to git:

```yaml
title: My Project
columns:
  - id: todo
    name: Todo
  - id: doing
    name: Doing
  - id: done
    name: Done
cards:
  - id: jwt-login
    title: Add JWT Login
    description: Implement JWT auth with refresh tokens
    column: doing
    priority: high
    labels: [backend, auth]
    assignee: alice
    effort: 5
    created_at: 2026-07-30T11:00:00Z
    updated_at: 2026-07-30T14:00:00Z
```

Human-readable. Diff-friendly. Git-tracked. No lock-in.

---

## Design Principles

- **Offline** — no cloud, no database, no server required
- **Plain YAML** — `cat`, `grep`, `diff`, `git merge` all work
- **Single binary** — written in Rust, no runtime dependencies
- **Install in 10 seconds** — `curl | sh` → ready
- **Works in any project** — `barkcli init` → done

---

## Building from Source

```shell
cargo build && cargo test
```

The repo is a Cargo workspace with five crates:

- `barkcli-core` — models, storage, commands
- `barkcli-cli` — the binary
- `barkcli-tui` — ratatui terminal UI
- `barkcli-server` — axum web server
- `vscode-extension` — VS Code extension

---

## Contributing

Contributions are welcome! Open an issue or PR on GitHub:

https://github.com/AkshatNaruka/barkcli

---

## License

MIT. See [LICENSE](LICENSE). The CLI, TUI, web app, and VS Code extension are free and open source.
