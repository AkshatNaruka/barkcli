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

| Method | Command |
|--------|---------|
| **macOS / Linux** | `curl -fsSL https://barkcli.vercel.app/install.sh \| sh` |
| **Homebrew** | `brew install barkcli` *(first time: `brew tap AkshatNaruka/barkcli`)* |
| **Cargo** | `cargo install barkcli` |
| **GitHub Releases** | Download from [github.com/AkshatNaruka/barkcli/releases](https://github.com/AkshatNaruka/barkcli/releases) |
| **Windows** | Download `.exe` from [GitHub Releases](https://github.com/AkshatNaruka/barkcli/releases) or `irm https://barkcli.vercel.app/install.ps1 \| iex` |

```bash
# macOS / Linux — one-liner (detects arch, verifies checksum, fallback to Vercel mirror)
curl -fsSL https://barkcli.vercel.app/install.sh | sh

# Homebrew (tap + install)
brew tap AkshatNaruka/barkcli
brew install barkcli
# Or directly:
brew install AkshatNaruka/barkcli/barkcli

# Cargo (from crates.io)
cargo install barkcli
# Or from source:
cargo install --git https://github.com/AkshatNaruka/barkcli barkcli
# Or local path:
cargo install --path barkcli-cli

# GitHub Releases — pick your platform:
#   barkcli-x86_64-apple-darwin.tar.gz        # macOS Intel
#   barkcli-aarch64-apple-darwin.tar.gz       # macOS Apple Silicon
#   barkcli-x86_64-unknown-linux-gnu.tar.gz   # Linux x64
#   barkcli-aarch64-unknown-linux-gnu.tar.gz  # Linux ARM64
#   barkcli-x86_64-pc-windows-msvc.zip        # Windows x64 (.exe)
#   SHA256SUMS                                # checksums
# Download + verify:
#   curl -LO https://github.com/AkshatNaruka/barkcli/releases/latest/download/barkcli-$(uname -m)-apple-darwin.tar.gz
#   shasum -a 256 -c SHA256SUMS

# Windows (PowerShell)
irm https://barkcli.vercel.app/install.ps1 | iex
# Or manual: download barkcli-x86_64-pc-windows-msvc.zip, unzip, add to PATH
```

> All artifacts are published together on every `v*` tag via GitHub Actions. The same binaries are mirrored at `https://barkcli.vercel.app/downloads/` for the `install.sh` fallback.

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
cargo run -p barkcli -- tui        # or: cargo run --bin barkcli -- tui
cargo run -p barkcli -- serve --port 3000
```

### Release pipeline

All downloadable versions are built from the same `v*` tag in one GitHub Actions run (`.github/workflows/release.yml`):

- **5 targets**: `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc` (zip)
- **Artifacts**: `*.tar.gz` / `*.zip` + `*.sha256` + `SHA256SUMS` + `install.sh` + `install.ps1`
- **Single GitHub Release** with `generate_release_notes: true` — all files attached together
- **Homebrew** formula auto-bumped (`homebrew/barkcli.rb` + `Formula/barkcli.rb`) and committed to `master`
- **Vercel mirror** `landing-next/public/downloads/` deployed to `barkcli.vercel.app/downloads`
- **crates.io** `cargo publish` for `barkcli-core` → `barkcli-tui` → `barkcli-server` → `barkcli`
- **Self-update** `barkcli update` tries GitHub Releases first, falls back to Vercel

To cut a release:

```bash
# Bump versions in barkcli-*/Cargo.toml and homebrew/barkcli.rb if not using auto-bump
git tag v0.2.1
git push origin v0.2.1
# Watch: gh run watch  && gh release view v0.2.1
```

Local dry-run:

```bash
cargo build --release
./target/release/barkcli --version
bash -n landing-next/public/install.sh
ruby -c homebrew/barkcli.rb
cargo metadata --format-version 1 --no-deps | jq
```

## License

MIT — see [LICENSE](LICENSE)
