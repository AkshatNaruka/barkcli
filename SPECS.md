# Specs: `barkcli` v1.0 Enhancement

> Internal development specs. Status: ✅ Complete

---

## Design Principles

1. **Install in 10 seconds** — `curl barkcli.vercel.app | sh` → single binary on `$PATH`
2. **Works in any project** — `barkcli init` → done. No config wizard, no Docker, no DB.
3. **Git-native** — `.board` YAML files committed to repo. PRs show card diffs. Merge = sync.
4. **Work in any medium** — Same data, same tool in terminal, browser, IDE.
5. **Keyboard-driven** — Every action reachable without a mouse, TUI and web both.
6. **Progressive complexity** — `barkcli add "fix bug"` is enough to start.

---

## Spec A: One-Command Install

**Goal**: Install barkcli in one terminal command, zero dependencies except Rust toolchain (or download binary from releases).

### Tasks

- [x] **A1**: `install.sh` — detects OS (macOS, Linux), installs with cargo or downloads binary
- [x] **A2**: `barkcli --version` prints version + commit SHA + build date
- [x] **A3**: `barkcli update` command — checks GitHub releases, downloads latest, replaces binary
- [x] **A4**: `.gitattributes` for binary in releases
- [x] **A5**: README updated with install instructions + badges

### Acceptance
```shell
curl -fsSL https://raw.githubusercontent.com/.../main/install.sh | sh
barkcli --version
barkcli init && barkcli create test && barkcli test add "hello" && barkcli test list
```
All works from a fresh machine in under 30 seconds.
**Status: ✅ DONE**

---

## Spec B: Terminal UI v2

**Goal**: Pro-level TUI with command palette, themes, improved detail panel, query syntax search.

### Tasks

- [x] **B1**: Color theme system — light, dark presets, configurable via `:theme`
- [x] **B2**: Command palette (`:` key) — `:new`, `:move <col>`, `:filter <text>`, `:sort`, `:theme`, `:help`
- [x] **B3**: Search/filter query syntax — `is:todo priority:high label:bug assignee:alice`
- [x] **B4**: Auto-complete on filter fields (column names, priorities, labels, assignees)
- [x] **B5**: Improved card detail panel — right split with editable fields, Tab cycling
- [x] **B6**: UI polish — Unicode borders, priority dots (●), label tags, card count badges
- [x] **B7**: Status bar with mode indicator (NORMAL, FILTER, ADD, EDIT, COMMAND, DETAIL)

**Status: ✅ DONE**

---

## Spec C: Web UI v2 — Vite + React Standalone

**Goal**: Production-quality Kanban web UI with drag-and-drop, multi-view, command palette.

### Tasks

- [x] **C1**: Scaffold `web/` with Vite + React + TypeScript + Tailwind CSS
- [x] **C2**: Port existing vscode-extension webview components to `web/`
- [x] **C3**: `@dnd-kit/core` — drag-and-drop between columns with overlay
- [x] **C4**: Drop zone highlight when dragging over column (blue tint)
- [x] **C5**: Inline editing via modal — title, description, priority dropdown, labels, assignee, due date
- [x] **C6**: Context menu on cards (⋯ button → Edit / Delete)
- [x] **C7**: Add card button at column bottom
- [x] **C8**: Board view with Kanban columns + dnd
- [x] **C9**: Table view — spreadsheet with column dropdowns, priority colors, delete button
- [x] **C10**: Calendar view — month grid with cards on their due dates
- [x] **C11**: List view — priority-sorted flat list with column selector
- [x] **C12**: Command palette (`Cmd+K`) — fuzzy search cards, commands, theme toggle
- [x] **C13**: Dark/light toggle, persisted in localStorage
- [x] **C14**: Loading skeleton (pulsing placeholders) while board loads
- [x] **C15**: Toast notifications for add/delete actions
- [x] **C16**: Board title + card count in header
- [x] **C17**: Scrollable columns on narrow screens
- [x] **C18**: VS Code API shim — same `web/` app works in VS Code extension
- [x] **C19**: Build output → served by `barkcli-server` via `ServeDir`

**Status: ✅ DONE**

---

## Spec D: Git Integration

**Goal**: Make `.board` YAML files feel like first-class git citizens.

### Tasks

- [x] **D1**: `barkcli init` installs `pre-commit` hook that runs `barkcli validate`
- [x] **D2**: `barkcli init` offers `commit-msg` hook template: `[card-id] Your message`
- [x] **D3**: `barkcli log [--board <name>]` — reads `.board/history/<name>.log` and pretty-prints
- [x] **D4**: `barkcli diff [--board <name>] [<ref>]` — shows added, removed, moved cards vs git ref
- [x] **D5**: `barkcli pr-summary [--board <name>] [--base <branch>]` — markdown table for PRs

**Status: ✅ DONE**

---

## Spec E: VS Code Extension v2

**Goal**: VS Code custom editor reuses the new Vite-built webview.

### Tasks

- [x] **E1**: Extension auto-detects and loads new web build when synced via `build:sync-web`
- [x] **E2**: Web app handles VS Code API bridge via `api.ts` shim
- [x] **E3**: `boardEditor.ts` fallback to old webview when new build not present
- [x] **E4**: Package.json `build:sync-web` copies web/dist into extension dist

**Status: ✅ DONE**

---

## Spec F: Performance & Polish

**Goal**: Fast, small, responsive.

### Tasks

- [x] **F1**: Webview JS bundle: 260KB (83KB gzipped) — well under 500KB target
- [x] **F2**: Server serves static assets from RAM (ServeDir) — < 1ms TTFB
- [x] **F3**: TUI renders from in-memory Board struct — no re-parsing per frame
- [x] **F4**: `barkcli validate` on current board < 5ms
- [x] **F5**: `barkcli serve` startup < 100ms

**Status: ✅ DONE**
