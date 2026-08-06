# barkcli — Git-like Project Board Tool (Internal)

> Private repository. Do not share outside the team.

`barkcli` is a CLI (+ VS Code extension) for task tracking inside any project. Like `.git` but for Kanban boards.

## Repository layout

```
project/
├── .board/              # Internal metadata (gitignored, auto-added)
├── *.board              # User-facing YAML board files (committed)
├── barkcli-core/        # Library: models, storage, commands (src/)
├── barkcli-cli/         # Binary: pro commands, TUI/serve dispatch
├── barkcli-tui/         # ratatui terminal kanban
├── barkcli-server/      # axum browser server
├── vscode-extension/    # VS Code Custom Editor extension
└── barkcli-cli/tests/cli.rs  # integration tests (30+)
```

## CLI — `barkcli`

Build + test: `cargo build && cargo test` (from repo root, 30 CLI tests + 9 unit).

### Project commands

| Command | Description |
|---|---|
| `barkcli init` | Create `.board/` + config.json + `.gitignore` |
| `barkcli create <name>` | Create `<name>.board` YAML |
| `barkcli list` / `ls` | Table of all boards |
| `barkcli status` | Cross-board column summary |
| `barkcli validate` | Validate all `.board` files (exit 1 on error) |
| `barkcli doctor` | Validate + auto-fix missing fields |
| `barkcli clean` | Remove stale locks + orphaned history |
| `barkcli export <name> [json\|yaml]` | Export board to stdout |
| `barkcli import <name> [file]` | Import board from stdin or file (JSON/YAML) |

### Board card operations

```
barkcli <name> add <title>       (-d, -p, -l, -a, --column)
barkcli <name> list              (-c, -p, -l filters)
barkcli <name> show <id>
barkcli <name> move <id> <col>
barkcli <name> status <id> <col> (quick alias for move)
barkcli <name> update <id>       (-t, -d, -p, -l, -a, -c)
barkcli <name> remove <id>
barkcli <name> export [format]
```

### Card IDs
Auto-generated kebab-case slugs from title (e.g. `"JWT Login"` → `jwt-login`). Deduplicated with numeric suffix.

### History
Every card operation logs to `.board/history/<board>.log` (JSONL). `read_history()` available for `barkcli log`.

### Sessions, checkpoints & hooks

| Command | Description |
|---|---|
| `barkcli session list` / `show <id>` / `resume <id>` | Agent session capture (`.board/sessions/<board>.jsonl`) |
| `barkcli session log` | Record a session from JSON on stdin (hook contract) |
| `barkcli checkpoint list` / `save [label]` / `show <id>` / `restore <id>` | Checkpoints at `.board/snapshots/` |
| `barkcli hooks install/remove/status [--agent opencode\|claude-code]` | Agent hooks → `.opencode/plugins/barkcli.ts`, `.claude/settings.json` |

- **Auto-checkpoints**: post-commit git hook runs `barkcli checkpoint save --auto`; saves `.board/snapshots/auto/<board>-<12-char-sha>.yaml` only when the commit touched `*.board` files.
- **Redaction**: `util/redact.rs` — regex secret layers (`sk-…`, `ghp_…`, `Bearer …`, DB URLs, kv assignments); applied in `storage/history.rs::append` + `storage/sessions.rs::append` before writes.
- **Sessions**: `models/session.rs` — `SessionEntry { id, agent, model, board, prompt, commit_sha, files_touched, summary, at, duration_ms }`; JSONL in `.board/sessions/`.
- `clean` also prunes orphaned session logs + auto-checkpoints for deleted boards.

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
- **Rust → Extension bridge**: Subprocess calls (`barkcli parse --json`, `barkcli validate`)
