# Specs: `board` v1.0 Enhancement

> Status: Each spec has checkboxes. Mark `[x]` when a task is fully done and verified.
> Branch: `feat/enhanced-ui`

---

## Design Principles

1. **Install in 10 seconds** — `curl get.board.io | sh` → single binary on `$PATH`
2. **Works in any project** — `board init` → done. No config wizard, no Docker, no DB.
3. **Git-native** — `.board` YAML files committed to repo. PRs show card diffs. Merge = sync.
4. **Work in any medium** — Same data, same tool in terminal, browser, IDE.
5. **Keyboard-driven** — Every action reachable without a mouse, TUI and web both.
6. **Progressive complexity** — `board add "fix bug"` is enough to start.

---

## Spec A: One-Command Install

**Goal**: Install board in one terminal command, zero dependencies except Rust toolchain (or download binary from releases).

### Tasks

- [x] **A1**: `install.sh` — detects OS (macOS, Linux), installs with cargo or downloads binary
- [x] **A2**: `board --version` prints version + commit SHA + build date
- [x] **A3**: `board update` command — checks GitHub releases, downloads latest, replaces binary
- [ ] **A4**: `.gitattributes` for binary in releases
- [ ] **A5**: README updated with install instructions

### Acceptance
```shell
curl -fsSL https://raw.githubusercontent.com/.../main/install.sh | sh
board --version
board init && board create test && board test add "hello" && board test list
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

- [ ] **C1**: Scaffold `web/` directory with Vite + React + TypeScript + Tailwind CSS
- [ ] **C2**: Port existing vscode-extension webview components to `web/`
- [ ] **C3**: Integrate `@dnd-kit/core` for drag-and-drop between columns
- [ ] **C4**: Card drop indicator (visual where card will land)
- [ ] **C5**: Inline editing — click to edit title, priority dropdown, labels with `x` removal
- [ ] **C6**: Right-click context menu on cards (Edit, Move, Delete)
- [ ] **C7**: Add card inline (click at column bottom → input appears)
- [ ] **C8**: Board view (Kanban columns — ported from existing + dnd)
- [ ] **C9**: Table view — spreadsheet: ID, Title, Column, Priority, Assignee, Due, Labels
- [ ] **C10**: Calendar view — month grid with cards on their due dates
- [ ] **C11**: List view — flat prioritized list with drag-to-reorder
- [ ] **C12**: Command palette (`Cmd+K` / `Ctrl+K`) — fuzzy search cards, commands, navigation
- [ ] **C13**: Dark/light/system theme toggle, persisted in localStorage
- [ ] **C14**: Loading skeleton while board loads
- [ ] **C15**: Toast notifications with Undo for destructive actions
- [ ] **C16**: Board title + description editable at top
- [ ] **C17**: Responsive design — scrollable columns on narrow screens
- [ ] **C18**: VS Code API shim in `web/` so the same app works in VS Code extension
- [ ] **C19**: Build output → embedded in `board-server` via `include_bytes!`

### Acceptance
`board serve --open` opens browser. Drag cards between columns. Click card to edit inline. `Cmd+K` opens palette. Switch to Table/Calendar/List views. Dark mode toggle works. Edit a card → `.board` YAML updates → WS reloads.

---

## Spec D: Git Integration

**Goal**: Make `.board` YAML files feel like first-class git citizens.

### Tasks

- [ ] **D1**: `board init` installs `pre-commit` hook that runs `board validate`
- [ ] **D2**: `board init` offers `commit-msg` hook template: `[card-id] Your message`
- [ ] **D3**: `board log [--board <name>]` — reads `.board/history/<name>.log` and pretty-prints
- [ ] **D4**: `board diff [--board <name>] [<ref>]` — shows what changed between git refs in board terms
- [ ] **D5**: `board pr-summary [--base <branch>]` — markdown table summarizing board changes for PRs

### Acceptance
```shell
board log                    # shows last N card operations
board diff HEAD~1            # shows: 3 cards moved to Done, 2 added, 1 priority changed
board pr-summary --base main # generates markdown table
```

---

## Spec E: VS Code Extension v2

**Goal**: VS Code custom editor reuses the new Vite-built webview.

### Tasks

- [ ] **E1**: Extension loads `index.html` from the same build as `board-server`
- [ ] **E2**: VS Code theme auto-maps to light/dark (no manual toggle)
- [ ] **E3**: `Ctrl+S` in webview saves + validates board YAML
- [ ] **E4**: Status bar item shows current board name + card count

### Acceptance
Open `.board` file in VS Code → same UI as `board serve`. Dark/light auto-matches VS Code theme. Save via `Ctrl+S`.

---

## Spec F: Performance & Polish

**Goal**: Fast, small, responsive.

### Tasks

- [ ] **F1**: Webview JS bundle < 500KB gzipped (Vite code-split, tree-shake)
- [ ] **F2**: Server static asset TTFB < 1ms (RAM-served, already embedded)
- [ ] **F3**: TUI: cards rendered from cache, not re-parsed each frame
- [ ] **F4**: `board validate` on 1000-card board < 50ms
- [ ] **F5**: `board serve` startup < 100ms

### Acceptance
Benchmark: `board serve` starts in <100ms. Web UI loads in <1s. 1000-card board validates in <50ms.
