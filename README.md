# barkcli

> The management layer for AI agents. You decide **what** gets built — agents do the rest.

**Open source (MIT). Built in Rust. No cloud, no accounts.**

## How it works

1. **Type intent** — describe what you want in plain language.
2. **Approve the plan** — agents propose a decomposition; you approve, edit, or reject.
3. **Merge** — agents implement, test, and report back; you merge when review passes.

No CLI commands to memorize. The web app is the interface; the CLI is there for power users and scripts.

## Install & open

```bash
curl -fsSL https://barkcli.vercel.app/install.sh | sh
barkcli init --yes
barkcli serve --open
```

More install options (Homebrew, Cargo, Windows, releases): [Getting started](https://barkcli.vercel.app/docs/getting-started).

## What lives where

- **Autopilot loop** — intent → plan gate → dispatched packets → review → merge gate. Start here: [Autopilot guide](https://barkcli.vercel.app/docs/autopilot)
- **Web app** — Mind, Board, Specs, Agents, Memory, Timeline in your browser. [Web app guide](docs/content/WEB_APP_GUIDE.md)
- **AI agents** — 56 MCP tools for Claude Code, OpenCode, Cursor. [Agent prompt](docs/content/AI_AGENT_PROMPT.md) · [MCP guide](docs/content/MCP_AGENTS.md)
- **Memory & specs** — four-tier local memory, spec traceability. [Advanced](docs/content/ADVANCED.md) · [Code context](docs/content/CONTEXT.md) · [API](docs/content/API_REFERENCE.md)

## Documentation

| Guide | What it covers |
|-------|----------------|
| [Autopilot](https://barkcli.vercel.app/docs/autopilot) | The intent → approve → merge loop (start here) |
| [Usage manual](docs/content/USAGE_MANUAL.md) | Complete how-to guide |
| [Web app guide](docs/content/WEB_APP_GUIDE.md) | Browser interface, tabs, shortcuts, daemon mode |
| [Interfaces](docs/content/INTERFACES.md) | CLI, terminal UI, web app, VS Code setup |
| [Commands](docs/content/COMMANDS.md) | Full CLI reference (power users) |
| [AI agent prompt](docs/content/AI_AGENT_PROMPT.md) | Paste into your coding agent |
| [MCP agents](docs/content/MCP_AGENTS.md) | Agent integration via MCP |
| [Code context](docs/content/CONTEXT.md) | Linking cards to code |
| [API reference](docs/content/API_REFERENCE.md) | REST + WebSocket reference |
| [Advanced](docs/content/ADVANCED.md) | Sessions, checkpoints, sprints, hooks |
| [Live docs site](https://barkcli.vercel.app/docs) | Searchable docs with guides and comparisons |

## Architecture

```
barkcli/
├── barkcli-core/       # Core library (models, storage, commands, memory, agent, autopilot)
├── barkcli-cli/        # CLI binary + listener
├── barkcli-tui/        # Terminal UI (ratatui)
├── barkcli-server/     # Web server (axum)
├── vscode-extension/   # VS Code custom editor
├── web/                # Web frontend (Vite + React)
└── landing-next/       # Landing page + docs (Next.js)
```

## Development

```bash
cargo build
cargo test
```

## License

MIT — see [LICENSE](LICENSE)
