<div align="center">

# 🐕 barkcli

**The management layer for AI agents — and a git-native Kanban board.**

You decide *what* gets built. Agents propose plans, do the work, and report back. barkcli runs the pipeline: **intake → plan → dispatch → review → merge**. Tasks, specs, memory, skills, and agent runs live in your repo — no cloud, no accounts, no subscriptions.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Crate](https://img.shields.io/crates/v/barkcli)](https://crates.io/crates/barkcli)
[![Rust](https://img.shields.io/badge/rust-1.75%2B-orange.svg)](https://www.rust-lang.org)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#)
[![Linux](https://img.shields.io/badge/platform-Linux-lightgrey.svg)](#)
[![Windows](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](#)
[![Version](https://img.shields.io/github/v/release/AkshatNaruka/barkcli)](https://github.com/AkshatNaruka/barkcli/releases)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Install](#install) · [Quick Start](#quick-start) · [Docs](https://barkcli.vercel.app/docs) · [Web App](https://barkcli.vercel.app) · [Comparisons](https://barkcli.vercel.app/compare) · [Discussions](https://github.com/AkshatNaruka/barkcli/discussions)

</div>

---

## Table of Contents

- [Why barkcli?](#why-barkcli)
- [Features](#features)
- [Install](#install)
- [Quick Start](#quick-start)
- [The Autopilot Loop](#the-autopilot-loop)
- [CLI Reference](#cli-reference)
- [AI Agent Integration](#ai-agent-integration)
- [Interfaces](#interfaces)
- [Documentation](#documentation)
- [Benchmarks & Comparisons](#benchmarks--comparisons)
- [Architecture](#architecture)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Community](#community)
- [License](#license)

---

## Why barkcli?

Like `.git` but for Kanban boards. Project management for the terminal era — and the missing piece in the AI-native dev stack.

- **Tasks are files.** Boards are plain YAML committed to your repo. Diff them, merge them, grep them, roll them back — exactly like code.
- **One binary, four interfaces.** CLI, terminal UI (ratatui), web app (axum), and a VS Code Custom Editor. Same data, every surface.
- **AI agents in the loop.** 56 MCP tools let Claude Code, OpenCode, and Cursor read tasks, claim work, and update progress — with full project context.
- **No cloud. No accounts. No subscriptions.** Works fully offline. MIT licensed. Your data never leaves your machine.

---

## Features

| | |
|---|---|
| 🧠 **Mind** | Compiled project snapshot — health, blockers, stale work, next actions. One command answers "what's happening?". |
| 📋 **Kanban Board** | Columns, priorities, labels, assignees, checklists, comments, effort, due dates, reminders. Drag-and-drop in the web app. |
| 🔗 **Spec Traceability** | Specs → requirements → code. Every card links to its spec and to the code that implements it. |
| 🛠 **MCP Server** | 56 tools for AI coding agents — board, task, memory, specs, orchestration, sessions. `barkcli mcp`. |
| 🤖 **Autopilot** | Intent → plan gate → dispatched packets → review → merge gate. Agent-driven with human approval. |
| 🧠 **Memory** | Four-tier local memory + project facts that persist across sessions. Hybrid search. |
| 📦 **BMAD Skills** | Reusable conventions (mvp, planning, scrum-master, test) versioned in your repo, injected into agent prompts. |
| 📅 **Sprints** | Time-boxed planning with velocity tracking. |
| 🎯 **Code Context** | Symbol search (`barkcli code`), file-to-card mapping, git-aware refresh. |
| ⏱ **Timeline** | Checkpoints, undo, diff, blame, validate, doctor. Your board, version-controlled. |
| 🔀 **Import/Export** | YAML and JSON. Migrate from Linear, Jira, Trello, GitHub Projects. |

---

## Install

### One-liner (macOS & Linux)

```bash
curl -fsSL https://barkcli.vercel.app/install.sh | sh
```

### Homebrew

```bash
brew tap AkshatNaruka/barkcli && brew install barkcli
```

### Cargo

```bash
cargo install barkcli
```

### Binary releases

Download prebuilt binaries for macOS (Intel + Apple Silicon), Linux, and Windows from the [Releases page](https://github.com/AkshatNaruka/barkcli/releases).

> Windows: a native PowerShell installer (`install.ps1`) is also available.

---

## Quick Start

```bash
# 1. Init once per project (creates .board/, git hooks, spec sync, context autosync)
barkcli init

# 2. Create a board
barkcli create my-project

# 3. Add tasks (board-agnostic by default)
barkcli add "Fix login bug" -p high
barkcli add "Write E2E tests" -l backend

# 4. Work the board
barkcli list              # see all tasks
barkcli move fix-login-bug doing
barkcli done fix-login-bug

# 5. Open the web app (also daemon-safe: --open, --daemon, --stop)
barkcli serve --open
```

That's it. Your tasks are now YAML files in `.board/` — commit them and they're version controlled.

---

## The Autopilot Loop

```
You (intent)  →  barkcli (plan)  →  Agent (work)  →  barkcli (review)  →  You (merge)
     ←──────────────  memory, specs, context persist across runs  ──────────────→
```

1. **Intake** — describe what you want in plain language. `barkcli intake "Add OAuth login"`.
2. **Plan** — agents propose a decomposition; you approve, edit, or reject. `barkcli plan <card>`.
3. **Dispatch** — scoped packets (with file context + skills) go to agents. `barkcli dispatch`.
4. **Review** — completed work is validated before it lands. `barkcli review`.
5. **Merge** — you merge when review passes.

Read the full [Autopilot guide](https://barkcli.vercel.app/docs/autopilot).

---

## CLI Reference

```text
Project commands
  barkcli init                  Initialize .board/ + config + git hooks
  barkcli create <name>         Create a board
  barkcli list / ls             Table of all boards
  barkcli status                Cross-board column summary
  barkcli validate              Validate all .board files
  barkcli doctor                Validate + auto-fix
  barkcli export <name> <fmt>   Export board (yaml/json)
  barkcli import <name> [file]  Import board
  barkcli today                 Agenda: overdue / today / next 7 days
  barkcli calendar [YYYY-MM]    ASCII month calendar

Card operations (board-agnostic; legacy `barkcli <board> <cmd>` also works)
  barkcli add <title>           -d, -p, -l, -a, --column, --due, --effort
  barkcli list                  -c, -p, -l filters
  barkcli show <id>             View task details
  barkcli move <id> <column>    Move task
  barkcli done <id>             Mark as done
  barkcli update <id>           -t, -d, -p, -l, -a, -c, --due
  barkcli remove <id>           Delete task
  barkcli link <id> <target>    --as parent|child|related|blocked-by
  barkcli tree                  Parent → child hierarchy

Management layer
  barkcli intake "<text>"       Classify intent → card + spec
  barkcli plan <card>           Spec + decomposition
  barkcli dispatch              Run orchestration cycle
  barkcli review [--all]        Validate completed work
  barkcli mind sync|show        Project health snapshot
  barkcli skills list|show      BMAD skills
  barkcli memory add|search     Four-tier memory

Pro commands (free, included in MIT)
  barkcli ai "<prompt>"         AI task breakdown
  barkcli report                Weekly report
  barkcli changelog             Release notes
  barkcli stats                 Velocity
  barkcli sync --push/--pull    GitHub sync
```

Full reference: [docs/COMMANDS.md](docs/COMMANDS.md) · [Online](https://barkcli.vercel.app/docs/commands)

---

## AI Agent Integration

barkcli is an MCP server. Point any MCP-compatible agent at it:

```bash
barkcli mcp
```

**Claude Code** — add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "barkcli": { "command": "barkcli", "args": ["mcp"] }
  }
}
```

**OpenCode** — add to `.opencode/config.json`; **Cursor** — `.cursor/mcp.json`, same shape.

The 56 tools cover boards, cards, tasks, agents, memory, specs, sessions, orchestration, code search, and autopilot. Agents can read task context, claim work, update progress, and run cycles — all inside your repo.

- [Integration hub](https://barkcli.vercel.app/integrations)
- [AI agent setup guide](https://barkcli.vercel.app/guides/ai-agent-setup)
- [AI agent prompt](docs/content/AI_AGENT_PROMPT.md) — paste into your coding agent
- [MCP agents guide](docs/content/MCP_AGENTS.md)

---

## Interfaces

| Interface | Command | What it is |
|---|---|---|
| **CLI** | `barkcli <cmd>` | Full-featured CLI for scripts and automation |
| **Terminal UI** | `barkcli tui` | Ratatui kanban with vim navigation (tabs for agents/orchestrate) |
| **Web App** | `barkcli serve --open` | Browser UI on `:4321` — Mind, Board, Specs, Calendar, Reports, Agents, Memory, Timeline |
| **VS Code** | `barkcli vscode-install` | Custom Editor for `.board` files |
| **MCP** | `barkcli mcp` | JSON-RPC 2.0 server for AI coding agents |
| **Daemon** | `barkcli serve --daemon` | Background server with live-reload WebSocket |

---

## Documentation

| Guide | What it covers |
|---|---|
| [Autopilot](https://barkcli.vercel.app/docs/autopilot) | The intent → approve → merge loop (start here) |
| [Getting Started](https://barkcli.vercel.app/docs/getting-started) | Install + first task |
| [Usage manual](docs/content/USAGE_MANUAL.md) | Complete how-to guide |
| [Web app guide](docs/content/WEB_APP_GUIDE.md) | Browser interface, tabs, shortcuts, daemon mode |
| [Interfaces](docs/content/INTERFACES.md) | CLI, TUI, web app, VS Code setup |
| [Commands](docs/content/COMMANDS.md) | Full CLI reference |
| [AI agent prompt](docs/content/AI_AGENT_PROMPT.md) | Paste into your coding agent |
| [MCP agents](docs/content/MCP_AGENTS.md) | Agent integration via MCP |
| [Code context](docs/content/CONTEXT.md) | Linking cards to code |
| [API reference](docs/content/API_REFERENCE.md) | REST + WebSocket reference |
| [Advanced](docs/content/ADVANCED.md) | Sessions, checkpoints, sprints, hooks |
| [Live docs](https://barkcli.vercel.app/docs) | Searchable docs with comparisons |

---

## Benchmarks & Comparisons

| vs | Read the take |
|---|---|
| [Linear](https://barkcli.vercel.app/compare/linear) | Git-native vs cloud-first |
| [Jira](https://barkcli.vercel.app/compare/jira) | Simple vs enterprise |
| [Trello](https://barkcli.vercel.app/compare/trello) | Code vs cloud |
| [Notion](https://barkcli.vercel.app/compare/notion) | Tasks vs everything |
| [GitHub Projects](https://barkcli.vercel.app/compare/github-projects) | Local vs platform |

The short version: if you want tasks in your repo, offline-ready, with AI agents as first-class workers — barkcli. If you need a mega-platform or enterprise compliance, keep the SaaS tool alongside.

---

## Architecture

```text
barkcli/
├── barkcli-core/       # Library: models, storage, commands, memory, agent, autopilot
├── barkcli-cli/        # Binary: pro commands, TUI/serve dispatch, listener
├── barkcli-tui/        # Ratatui terminal kanban (feature-flagged)
├── barkcli-server/     # Axum web server + WebSocket live reload
├── web/                # React + Vite web frontend
├── vscode-extension/   # VS Code Custom Editor extension
├── landing-next/       # Next.js landing page + docs + llms.txt
└── docs/               # Documentation
```

**Storage model:** boards are `*.board` YAML files (committed); internal metadata lives in `.board/` (gitignored, auto-added). Git is the sync layer — push, pull, branch, merge; your board travels with your code.

---

## Development

```bash
git clone https://github.com/AkshatNaruka/barkcli.git
cd barkcli
cargo build --release
cargo test
```

For the web app + landing:

```bash
cd web && npm install && npm run dev       # web UI (served by `barkcli serve`)
cd landing-next && npm install && npm run build   # marketing + docs site
```

Contributions welcome — see [CONTRIBUTING](#contributing).

---

## Roadmap

- [ ] Multi-agent fleet improvements (worktrees, leases, dispatcher v2)
- [ ] Web intent UI + interactive init polish
- [ ] WebMCP / OKF agent-readiness layer
- [ ] More BMAD skills and templates
- [ ] Plugins / hooks ecosystem

Track live work on the [project board](https://github.com/AkshatNaruka/barkcli/projects) — or just `barkcli` it.

---

## Contributing

barkcli is open source (MIT) and welcomes contributions of all kinds — code, docs, design, ideas.

1. Fork the repo.
2. Create a feature branch (`git checkout -b feat/amazing`).
3. Commit your changes (stem from a board card if you like).
4. Open a [pull request](https://github.com/AkshatNaruka/barkcli/pulls).

**Not ready to code?** You can still help: star the repo, report [issues](https://github.com/AkshatNaruka/barkcli/issues), answer [discussions](https://github.com/AkshatNaruka/barkcli/discussions), or improve [docs](https://barkcli.vercel.app/docs).

---

## Community

- **Docs & Web App**: <https://barkcli.vercel.app>
- **Discussions**: <https://github.com/AkshatNaruka/barkcli/discussions>
- **Issues**: <https://github.com/AkshatNaruka/barkcli/issues>
- **X / Twitter**: [@probiex007](https://x.com/probiex007)
- **Maintainer**: [Akshat Naruka](https://github.com/AkshatNaruka)

---

## License

[MIT](LICENSE) © 2026 [Akshat Naruka](https://github.com/AkshatNaruka). Free to use, modify, and distribute. No cloud, no accounts, no lock-in — every commit is yours.
