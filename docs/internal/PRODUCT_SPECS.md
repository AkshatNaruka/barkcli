# Product Specs — `barkcli pro` (Paid Features)

> Each spec has checkboxes. Mark `[x]` when fully done and tested.
> Branch: `master` (committing directly after previous merges)

---

## Spec P1: License Key System

**Goal**: Offline license validation. Single binary, no phone home. Users activate once.

### Tasks

- [x] **P1.1**: `barkcli license activate <key>` — validates key hash, writes `~/.board/license`
- [x] **P1.2**: `barkcli license status` — shows activation status
- [x] **P1.3**: `barkcli --version` shows `pro` badge if licensed
- [x] **P1.4**: Paid commands check `is_licensed()` before executing
- [x] **P1.5**: License key generator script (for selling keys)
- [x] **P1.6**: Valid keys shipped as a const hash set in the binary

**Status: [DONE] DONE**

---

## Spec P2: `barkcli ai` — AI Task Breakdown

**Goal**: `barkcli ai "build auth"` → generates cards in the board. Users bring their own API key.

### Tasks

- [x] **P2.1**: `barkcli ai "<prompt>"` command (pro-only)
- [x] **P2.2**: Reads `OPENAI_API_KEY` from env or `~/.board/config`
- [x] **P2.3**: Calls OpenAI chat completions API with structured prompt
- [x] **P2.4**: Parses JSON response into cards
- [x] **P2.5**: Adds cards to the default board
- [x] **P2.6**: `--dry-run` flag to preview without saving
- [x] **P2.7**: Supports `--model` flag (default: gpt-4o-mini)

**Status: [DONE] DONE**

### Acceptance
```
export OPENAI_API_KEY=sk-...
barkcli ai "Implement JWT auth with refresh tokens"
  → "Generated 6 tasks in tasks.board: ..."
barkcli ai "ship MVP in 2 weeks" --dry-run
  → "Would create 12 tasks (dry run)"
```

---

## Spec P3: `barkcli report` — Weekly Report Generator

**Goal**: `barkcli report` generates a markdown summary of what happened this week.

### Tasks

- [x] **P3.1**: `barkcli report [--since "7 days ago"]` command (pro-only)
- [x] **P3.2**: Shows: tasks completed, in progress, blocked, added
- [x] **P3.3**: Outputs clean markdown ready for Twitter/LinkedIn/investor update
- [x] **P3.4**: `--json` flag for machine-readable output
- [x] **P3.5**: Groups by assignee and priority

**Status: [DONE] DONE**

### Acceptance
```
barkcli report --since "7 days ago"
  → ## Weekly Report (Aug 1 - Aug 8)
  → **Completed (12)**: ...
  → **In Progress (5)**: ...
  → **Blocked (2)**: ...
```

---

## Spec P4: `barkcli changelog`

**Goal**: Generate a changelog from completed tasks since the last git tag.

### Tasks

- [x] **P4.1**: `barkcli changelog [--since <ref>]` command (pro-only)
- [x] **P4.2**: Finds all `done` cards since the specified git ref
- [x] **P4.3**: Outputs markdown grouped by added/completed
- [x] **P4.4**: Detects last git tag automatically as the `since` ref

**Status: [DONE] DONE**

### Acceptance
```
barkcli changelog
  → ## v0.3.0
  → ### Added: ...
  → ### Fixed: ...
  → ### Changed: ...
```

---

## Spec P5: `barkcli stats` — Analytics

**Goal**: Terminal analytics dashboard showing velocity and trends.

### Tasks

- [x] **P5.1**: `barkcli stats` command (pro-only)
- [x] **P5.2**: Shows: total, done, in-progress, blocked counts
- [x] **P5.3**: Progress bar (███░░░) in terminal
- [x] **P5.4**: Per-column and per-priority breakdown

**Status: [DONE] DONE**

### Acceptance
```
barkcli stats
  → Weekly Velocity: 12.3 cards/week (↑ 2.1 from last week)
  → Avg Cycle Time: 2.3 days
  → Burndown: ████████░░░░ 67% complete
```

---

## Spec P6: Templates System

**Goal**: `barkcli template saas-launch` creates a board with pre-built cards.

### Tasks

- [x] **P6.1**: Templates shipped in binary as const arrays
- [x] **P6.2**: `barkcli template list` — shows 5 available templates with task counts
- [x] **P6.3**: `barkcli template install <name>` — copies template cards to current board
- [x] **P6.4**: Ship 5 templates: saas-launch(15), mobile-app(7), fundraising(7), hiring(6), open-source(8)
- [x] **P6.5**: Templates use board-core::Card APIs for native integration

**Status: [DONE] DONE**

### Acceptance
```
board template list
  → Available templates: saas-launch, mobile-app, fundraising, hiring
board template install saas-launch
  → Added 34 tasks from saas-launch template to tasks.board
```

---

## Spec P7: Landing Page v2 — Features + FAQ (pricing removed)

**Goal**: Present the product without pricing — the tool ships free and open
source (MIT); monetization is deferred.

### Tasks

- [x] **P7.1**: Feature comparison table — what barkcli does vs. task tools
- [x] **P7.2**: Features section with cards
- [x] **P7.3**: FAQ section with common questions
- [x] **P7.4**: Deployed live on Vercel
- [x] **P7.5**: Nav with Features, GitHub, theme toggle
- [~] **P7.6**: Pricing section — **removed**: not monetizing initially

**Status: [DONE] DONE (pricing deferred)**

### Acceptance
Landing page at barkcli.vercel.app presents the product, install command and
GitHub link. No pricing or checkout.

---

## Spec P8: Sprint Commands

**Goal**: `barkcli sprint start/end` for time-boxed planning.

- [x] **P8.1**: `barkcli sprint start <name>` — tags current `todo` cards as sprint items
- [x] **P8.2**: `barkcli sprint end` — moves remaining to next sprint, shows velocity
- [x] **P8.3**: Sprint history stored for velocity calculations

**Status: [DONE] DONE**

---

## Spec P9: GitHub Issues Sync

**Goal**: `barkcli sync` pushes cards to GitHub Issues.

- [x] **P9.1**: `barkcli sync --push` — creates GitHub Issues from cards
- [x] **P9.2**: `barkcli sync --pull` — imports GitHub Issues as cards
- [x] **P9.3**: Two-way link stored in card metadata (`synced` label + `gh:<number>` label)

**Status: [DONE] DONE**

---

## Spec P10: Work Item Links & Hierarchy

**Goal**: Cards become work items: PBI → child tasks, related/blocked-by links, acceptance criteria, effort, area.

- [x] **P10.1**: `Card.links: Vec<CardLink {ty: parent|child|related|blocked-by, target}>` in YAML; legacy `blocked_by` still parses
- [x] **P10.2**: `barkcli link <id> <target> --as <ty>` + `unlink`; parent↔child auto-mirrored
- [x] **P10.3**: Cycle guard — parent/child links that create cycles are rejected
- [x] **P10.4**: `barkcli tree` renders the parent→child hierarchy
- [x] **P10.5**: `--effort N`, `--area <name>`, `--ac "<text>"` on add/update; `--no-effort`, `--no-area`, `--rm-ac` on update
- [x] **P10.6**: `show` renders links/AC/effort/area

**Status: [DONE] DONE**

---

## Spec P11: Code Context (local, free)

**Goal**: Board knows which code each card touches — files, symbols, commit status. No LLM.

- [x] **P11.1**: `.board/context/<board>.json` sidecar (gitignored, regenerable): per-card files/symbols/sessions/AI + inverted `file → cards` index
- [x] **P11.2**: `code/` module: regex symbol extractor (Rust/TS/JS/Py/Go/other) + token index; .gitignore-aware tree walk
- [x] **P11.3**: `barkcli context scan` — fuzzy title→symbol matching, maps top-N files per card (children skipped)
- [x] **P11.4**: `barkcli context link <card> <path|symbol>` / `unlink` — manual pinning
- [x] **P11.5**: `barkcli context status` — coverage % + staleness table
- [x] **P11.6**: `barkcli context sync` — git-aware: last-commit vs dirty-files → clean/changed/unknown statuses
- [x] **P11.7**: `barkcli context autosync on|off` — marker-based post-commit hook stage (never clobbers user hooks)
- [x] **P11.8**: `barkcli code <query>` — symbol search → files → linked cards
- [x] **P11.9**: `clean` prunes orphaned context sidecars

**Status: [DONE] DONE**

---

## Spec P12: Agentic Context (Pro, provider-agnostic LLM)

**Goal**: AI agents keep task context fresh against code. Local-first by default.

- [x] **P12.1**: `barkcli-core/src/ai/` — one OpenAI-compatible path (OpenAI, Ollama, LM Studio); resolution env → `~/.board/config` → `.board/config.json ai` key; `chat_json` strips fences + validates
- [x] **P12.2**: `barkcli agent config set provider ollama|openai|lmstudio / base-url / model` + `show` + `reset`
- [x] **P12.3**: `barkcli context refresh [id...] [--apply]` (Pro) — per-card LLM summary → sidecar `ai` block (redacted, confidence, next_steps)
- [x] **P12.4**: `barkcli agent propose <id> [--accept]` (Pro) — LLM acceptance criteria + linked child tasks (created via `link`)
- [x] **P12.5**: `barkcli agent watch [--llm]` (Pro) — poll loop: dirty-file detection → context sync (+ LLM refresh with `--llm`)
- [x] **P12.6**: `barkcli ai` refactored onto shared provider (env/model overrides preserved)
- [x] **P12.7**: Session→card linking: opencode plugin captures tool file paths; `matched_card_ids` computed on append; card sidecar records session ids

**Status: [DONE] DONE**

---

## Spec P13: Reports & Web Polish

**Goal**: Effort visibility everywhere.

- [x] **P13.1**: `barkcli report --sprint <name>` — ASCII burndown bar + effort table for `sprint:<name>`-tagged cards (JSON mode too)
- [x] **P13.2**: `report` tables gain effort columns; JSON gains `total_effort`/`done_effort`
- [x] **P13.3**: Web TableView: area filter + column filter + effort/area columns + running effort totals
- [x] **P13.4**: Web CardForm tabs: Details / Acceptance / Links (picker) / Code (files, status dots, AI summary, open-in-editor)
- [x] **P13.5**: Web Activity modal (history + sessions timeline); card menu gains Activity
- [x] **P13.6**: Server: `/api/history`, `/api/sessions`, `/api/context`, `POST /api/context/sync`, `/api/code`; VS Code bridge: getCardContext/getHistory/getSessions/syncContext/openFile

**Status: [DONE] DONE**

---

## Implementation Order

| # | Spec | Est. | Dependencies |
|---|---|---|---|
| P1 | License System | 3h | — |
| P2 | `barkcli ai` | 3h | P1 |
| P3 | `barkcli report` | 2h | P1 |
| P4 | `barkcli changelog` | 2h | P1 |
| P5 | `barkcli stats` | 2h | P1 |
| P6 | Templates | 2h | P1 |
| P7 | Landing v2 | 2h | P1 |
| P8 | Sprints | 3h | P1 |
| P9 | GitHub Sync | 3h | P1 |
| P10 | Work Item Links | 3h | — |
| P11 | Code Context | 5h | — |
| P12 | Agentic Context | 5h | P10, P11 |
| P13 | Reports & Web Polish | 3h | P10–P12 |
