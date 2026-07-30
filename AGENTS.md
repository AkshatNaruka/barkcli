# Board — Git-like Project Board Tool

`board` is a CLI (+ VS Code extension) for task tracking inside any project. Like `.git` but for Kanban boards.

## Repository layout

```
project/
├── .board/              # Internal metadata (gitignored, auto-added)
├── auth.board           # User-facing YAML board files (committed)
├── vscode-extension/    # VS Code Custom Editor extension
├── Cargo.toml           # Rust CLI (src/)
└── tests/cli.rs         # 20 integration tests
```

## CLI — `board`

Build + test: `cargo build && cargo test` (from repo root, 20 tests).

### Project commands

| Command | Description |
|---|---|
| `board init` | Create `.board/` + config.json + `.gitignore` |
| `board create <name>` | Create `<name>.board` YAML |
| `board list` / `ls` | Table of all boards |
| `board status` | Cross-board column summary |
| `board validate` | Validate all `.board` files (exit 1 on error) |
| `board doctor` | Validate + auto-fix missing fields |
| `board clean` | Remove stale locks + orphaned history |
| `board export <name> [json\|yaml]` | Export board to stdout |
| `board import <name> [file]` | Import board from stdin or file (JSON/YAML) |

### Board card operations

```
board <name> add <title>       (-d, -p, -l, -a, --column)
board <name> list              (-c, -p, -l filters)
board <name> show <id>
board <name> move <id> <col>
board <name> status <id> <col> (quick alias for move)
board <name> update <id>       (-t, -d, -p, -l, -a, -c)
board <name> remove <id>
board <name> export [format]
```

### Card IDs
Auto-generated kebab-case slugs from title (e.g. `"JWT Login"` → `jwt-login`). Deduplicated with numeric suffix.

### History
Every card operation logs to `.board/history/<board>.log` (JSONL). `read_history()` available for Phase 4 `board log`.

## VS Code Extension

Located in `vscode-extension/`. Registers as Custom Editor for `*.board` files.

Build: `cd vscode-extension && npm install && npm run build`

Output: `dist/extension.js`, `dist/webview.js`, `dist/webview.css`

Architecture: Extension host reads `.board` YAML → `postMessage` → React webview parses with `js-yaml` → renders Kanban. Changes serialized back and sent via `postMessage({ type: "save", yaml })` → extension writes file → Git detects.

Run the extension: Open `vscode-extension/` in VS Code, press F5.

## Key technical details

- **Slug generation**: `util/slug.rs` — lowercase, hyphens, dedup
- **Board format**: YAML with `title`, `columns`, `cards` (see spec in plan)
- **Board dir**: Walks up directory tree to find `.board/` (like git)
- **Card schema**: `id`, `title`, `description`, `column`, `priority`, `labels`, `assignee`, `checklist`, `comments`, `due_date`, `created_at`, `updated_at`
- **Rust → Extension bridge**: Subprocess calls (`board parse --json`, `board validate`)
