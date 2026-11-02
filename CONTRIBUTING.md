# Contributing to barkcli

Thanks for helping make barkcli better — whether you're shipping code, writing docs, tweaking the UI, or reporting bugs. Everything is MIT, no CLA, no gates.

## Ways to contribute

- **Code** — Rust (CLI/TUI/server), TypeScript (web app, landing), or the VS Code extension
- **Docs** — the [docs site](https://akshatnaruka.github.io/barkcli/docs), this README, and the flat reference set in `docs/`
- **Design** — the web app follows a written design system ([`DESIGN.md`](DESIGN.md)); visual PRs should reference its tokens
- **Ideas & bugs** — [issues](https://github.com/AkshatNaruka/barkcli/issues) and [discussions](https://github.com/AkshatNaruka/barkcli/discussions)

## Dogfooding barkcli: Autonomous Agent & Human Collaboration

We use `barkcli` to develop `barkcli`! All tasks and roadmap items live in `dev.board`.

### Working with Autonomous Agents
You can use `barkcli run` to contribute features or bug fixes in isolated worktrees:
```bash
# Pick a task or intent, spawn an agent in a worktree, run the test gate
barkcli run "fix(tui): handle window resize gracefully in board view" --yes
```

### Finding Something to Work On
Look for issue tags in our repository:
- `good-first-issue`: Starter tasks ideal for newcomers (clear scope, isolated files).
- `help-wanted`: High-impact features, TUI improvements, or web view enhancements.
- `agent-ready`: Pre-scoped with test acceptance commands and target files, perfect for running through `barkcli run`.

## Getting started

Prerequisites: **Rust 1.75+** (`rustup`), **Node 20+**.

```bash
git clone https://github.com/AkshatNaruka/barkcli.git
cd barkcli

# Rust workspace — everything (core, cli, tui, server)
cargo build && cargo test

# Web app (Vite)
cd web && npm ci && npm run dev

# Landing/docs site (Next.js)
cd ../landing-next && npm ci && npm run dev
```

Local web development against real data: `cargo run -p barkcli-server` (or `barkcli serve` after `cargo install --path .`) serves the board API; the Vite dev server proxies to it.

## Project layout

```
barkcli-core/     Board model, YAML storage, commands (library)
barkcli-cli/      Binary: command dispatch, TUI/serve entrypoints
barkcli-tui/      ratatui terminal kanban
barkcli-server/   axum web server + static web bundle host
web/              React + Vite web frontend
landing-next/     Next.js marketing/docs site
vscode-extension/ VS Code custom editor
docs/             Docs site content + agent/CLI reference set
```

## Making changes

1. **Fork / branch**: `git checkout -b fix/checklist-drag` — keep branches focused.
2. **Work off a card**: barkcli tracks its own development in [`dev.board`](dev.board). `barkcli dev.board add "…"` keeps your change traceable — nice but optional.
3. **Commits**: conventional style — `feat:`, `fix:`, `docs:`, `polish(web):`, `chore(ci):` …
4. **Tests**: `cargo test` for Rust changes; `cd web && npm run build` (typechecks + builds) for web changes. UI changes benefit from before/after screenshots in the PR description.
5. **Docs**: If behavior changes, update the relevant page in `docs/` and/or the README.

## Pull requests

Open a PR against `master`. The CI workflow builds and tests the workspace and the web app. A maintainer reviews within a few days — tidy, focused PRs get merged fastest.

**First contribution?** Look for [good first issue](https://github.com/AkshatNaruka/barkcli/labels/good%20first%20issue) or [help wanted](https://github.com/AkshatNaruka/barkcli/labels/help%20wanted) labels, or start a conversation in Discussions.

## Community

- Read the [Code of Conduct](CODE_OF_CONDUCT.md) — be excellent to each other.
- Security issues: please report privately per [SECURITY.md](SECURITY.md), never as a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
