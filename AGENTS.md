# barkcli — Git-like Project Board Tool

> Open source (MIT). Build from source with `cargo build && cargo test`.

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

Build + test: `cargo build && cargo test` (from repo root, 33 CLI tests + 13 unit).

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
| `barkcli today` | Agenda: overdue / today / next 7 days / backlog |
| `barkcli calendar [YYYY-MM]` | ASCII month calendar of due cards + sprint ranges |
| `barkcli remind [--hours N]` | Cards with a reminder due (default 24h) |

### Board card operations

```
barkcli <name> add <title>       (-d, -p, -l, -a, --column, --due, --remind, --effort, --area, --ac)
barkcli <name> list              (-c, -p, -l filters)
barkcli <name> show <id>
barkcli <name> move <id> <col>
barkcli <name> status <id> <col> (quick alias for move)
barkcli <name> update <id>       (-t, -d, -p, -l, -a, -c, --due, --remind, --no-remind, --effort, --area, --ac, --rm-ac)
barkcli <name> remove <id>
barkcli <name> export [format]
barkcli <name> link <id> <target> (--as parent|child|related|blocked-by) + unlink
barkcli <name> tree              (parent→child hierarchy)
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
| `barkcli sprint start <name> [--ends YYYY-MM-DD]` / `end` / `list` | Sprints (Pro): labels + dated metadata |

- **Auto-checkpoints**: post-commit git hook runs `barkcli checkpoint save --auto`; saves `.board/snapshots/auto/<board>-<12-char-sha>.yaml` only when the commit touched `*.board` files.
- **Redaction**: `util/redact.rs` — regex secret layers (`sk-…`, `ghp_…`, `Bearer …`, DB URLs, kv assignments); applied in `storage/history.rs::append` + `storage/sessions.rs::append` before writes.
- **Sessions**: `models/session.rs` — `SessionEntry { id, agent, model, board, prompt, commit_sha, files_touched, summary, at, duration_ms, matched_card_ids }`; JSONL in `.board/sessions/`. `matched_card_ids` computed on append via the board's context index (files ∩ cards).
- **Sprints**: `models/sprint.rs` + `storage/sprints.rs` — metadata (name, start, end) in `.board/sprints/<board>.json`; `barkcli sprint start <name> [--ends YYYY-MM-DD]` / `end` / `list` (Pro). Cards tagged with `sprint:<name>` labels.
- **Reminders**: optional `remind_at` ISO timestamp per card (`--remind` on add/update); surfaced by `barkcli remind`, `barkcli today`, and the web calendar.
- **Calendar commands**: `commands/agenda.rs` — `today`, `calendar`, `remind` (free tier, read-only views of due/remind data).
- `clean` also prunes orphaned session logs + sprint metadata + auto-checkpoints + context sidecars for deleted boards.

### Work item links

Cards carry `links: [{ty: parent|child|related|blocked-by, target}]` in YAML (`models/card.rs::CardLink`). Convention: `X.add_link(Parent, Y)` = "Y is X's parent". `barkcli link <id> <target> --as child` → id's parent = target, auto-mirrored on target. Parent/child cycles rejected. Also `acceptance_criteria: Vec<String>`, `effort: Option<u32>`, `area: Option<String>`.

### Code context (free, local)

- Sidecar: `.board/context/<board>.json` (`models/context.rs::BoardContext`) — per-card `files` (path/symbols/source/last_commit/status), `sessions`, optional `ai` block; inverted `index: file → [cards]`. Gitignored, regenerable.
- `code/` module: `symbols.rs` (regex extractor: Rust/TS/JS/Py/Go/other + camel/snake tokenizer), `index.rs` (gitignore-aware walk, `match_title` fuzzy scoring, `search`).
- Commands: `code <q>`, `context scan|link|unlink|status|show|sync|autosync on|off|clear`. `sync` is git-aware (last-commit + dirty files). Autosync appends a marker stage to `.git/hooks/post-commit`.

### AI layer (Pro, provider-agnostic)

- `barkcli-core/src/ai/provider.rs` — OpenAI-compatible Chat Completions; config resolution env → `~/.board/config` (`BARKCLI_API_BASE`/`BARKCLI_MODEL`/`OPENAI_API_KEY`) → `.board/config.json` `ai` key. `barkcli agent config set provider ollama|openai|lmstudio|base-url|model` + `show`/`reset`.
- `barkcli context refresh [id...] [--apply]` (Pro) — LLM per-card summary → sidecar `ai` block; `--apply` also posts an `[ai]` comment.
- `barkcli agent propose <id> [--accept]` (Pro) — proposes acceptance criteria + linked child tasks.
- `barkcli agent watch [--llm] [--interval N] [--once]` (Pro) — poll dirty files → sync (+ refresh).
- `barkcli ai "<prompt>"` uses the shared provider (was OpenAI-only).
- Gated in `barkcli-cli/src/main.rs` (`license::check_pro("agent")` for refresh/propose/watch); `agent sync`/`agent config` are free.

## VS Code Extension

Located in `vscode-extension/`. Registers as Custom Editor for `*.board` files.

Build: `cd vscode-extension && npm install && npm run build`

Output: `dist/extension.js`, `dist/webview.js`, `dist/webview.css`

Architecture: Extension host reads `.board` YAML → `postMessage` → React webview parses with `js-yaml` → renders Kanban. Changes serialized back and sent via `postMessage({ type: "save", yaml })` → extension writes file → Git detects.

Run the extension: Open `vscode-extension/` in VS Code, press F5.

## Web server + TUI

- `barkcli serve [--port N] [--board <name>] [--host <ip>] [--token <t>] [-o]` — axum server.
  - **Security**: binds `127.0.0.1` by default; `--host 0.0.0.0` opts into LAN (prints warning). `--token <t>` requires `?token=` (or `Authorization: Bearer`) on every `/api/*` + `/ws` (static assets stay public; the CLI opens the browser with `?token=`). Board names are validated (`^[A-Za-z0-9._-]{1,64}$`) against path traversal; PUT `/api/board` parses the YAML as a `Board` and writes atomically (tmp + rename).
  - Endpoints: `/api/boards`, `/api/board` (GET/PUT), `/api/sprints` (GET/POST start, POST `/end`), `/api/history` (`?card=`, `?limit=`, `?since=`), `/api/sessions` (`?limit=`, `?since=`), `/api/context`, `/api/context/sync`, `/api/context/clear`, `/api/code` (symbol index cached 5s server-side), `/api/config` (ai base_url/model only), `/ws` (versioned reload broadcasts). Saves are debounced client-side (~250ms) and the client skips WS reloads caused by its own saves.
- **Web app** (`web/src/App.tsx`): hash-routed (`#/dashboard`, `#/board`, `#/calendar`, `#/reports`, `#/code`, `#/activity`, `#/sprints`, `#/settings`) with a top navbar (Dashboard, Board, Calendar, Reports, Code, Activity, Sprints, Settings) + board switcher dropdown. Board page keeps kanban/table/list sub-tabs. Dashboard = stat cards + sprint progress + activity/due feeds; Reports = sprint burndown + effort-by-column/area + priority charts (pure divs, no chart lib); Code = symbol search + context coverage table with sync/clear; Activity = merged history+sessions timeline; Sprints = start/end from UI; Settings = title/columns/theme/AI config. Kanban cards/columns are `React.memo`'d with `contain: layout style`; per-column card arrays are memoized in `BoardView`.
- **TUI** (`barkcli-tui/`): tab bar `1 Board · 2 List · 3 Tree · 4 Agenda · 5 Reports · 6 Code` (Tab cycles). Board = kanban (h/l columns, j/k cards, a add, e edit, d delete, H/L move, / filter, : palette). List = sortable backlog (p/t/e/u) with id/prio/effort/due/area columns. Tree = parent→child hierarchy. Agenda = overdue/today/next-7/later. Reports = ASCII sprint burndown + effort-by-column/area bars. Code = `/` symbol search → files + linked cards. Detail overlay shows links (l = link with target + type prompts, u = unlink — mirrors core `link.rs` semantics incl. cycle guard), acceptance criteria, effort, area, due, remind, and code context files with status; `e` edits.

## Key technical details

- **Slug generation**: `util/slug.rs` — lowercase, hyphens, dedup
- **Board format**: YAML with `title`, `columns`, `cards` (see spec in plan)
- **Board dir**: Walks up directory tree to find `.board/` (like git)
- **Card schema**: `id`, `title`, `description`, `column`, `priority`, `labels`, `assignee`, `checklist`, `comments`, `links`, `acceptance_criteria`, `effort`, `area`, `due_date`, `remind_at`, `created_at`, `updated_at`
- **Rust → Extension bridge**: Subprocess calls (`barkcli parse --json`, `barkcli validate`)
