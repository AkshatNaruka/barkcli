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

**Status: ✅ DONE**

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

**Status: ✅ DONE**

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

**Status: ✅ DONE**

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

**Status: ✅ DONE**

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

**Status: ✅ DONE**

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

**Status: ✅ DONE**

### Acceptance
```
board template list
  → Available templates: saas-launch, mobile-app, fundraising, hiring
board template install saas-launch
  → Added 34 tasks from saas-launch template to tasks.board
```

---

## Spec P7: Landing Page v2 — Pricing + Checkout

**Goal**: Convert visitors into buyers with pricing page + Gumroad checkout.

### Tasks

- [x] **P7.1**: Pricing section: 3 tiers (Free, Pro $49, Team $149) with Buy buttons
- [x] **P7.2**: Feature comparison table — 15 rows, Free vs Pro vs Team
- [x] **P7.3**: Pro glow card highlighted as "Most popular"
- [x] **P7.4**: Testimonials section with 3 founder quotes
- [x] **P7.5**: FAQ section with 6 common questions
- [x] **P7.6**: Deployed live on Vercel
- [x] **P7.7**: Updated nav with Pricing, Features, FAQ links

**Status: ✅ DONE**

### Acceptance
Landing page at getbarkcli.dev shows pricing cards. Clicking "Buy Pro $49" opens Gumroad checkout. After purchase, user receives license key email.

---

## Spec P8: Sprint Commands

**Goal**: `barkcli sprint start/end` for time-boxed planning.

- [ ] **P8.1**: `barkcli sprint start <name>` — tags current `todo` cards as sprint items
- [ ] **P8.2**: `barkcli sprint end` — moves remaining to next sprint, shows velocity
- [ ] **P8.3**: Sprint history stored for velocity calculations

---

## Spec P9: GitHub Issues Sync

**Goal**: `barkcli sync` pushes cards to GitHub Issues.

- [ ] **P9.1**: `barkcli sync --push` — creates GitHub Issues from cards
- [ ] **P9.2**: `barkcli sync --pull` — imports GitHub Issues as cards
- [ ] **P9.3**: Two-way link stored in card metadata (`github_issue: 42`)

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
