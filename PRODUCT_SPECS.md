# Product Specs — `board pro` (Paid Features)

> Each spec has checkboxes. Mark `[x]` when fully done and tested.
> Branch: `master` (committing directly after previous merges)

---

## Spec P1: License Key System

**Goal**: Offline license validation. Single binary, no phone home. Users activate once.

### Tasks

- [x] **P1.1**: `board license activate <key>` — validates key hash, writes `~/.board/license`
- [x] **P1.2**: `board license status` — shows activation status
- [x] **P1.3**: `board --version` shows `pro` badge if licensed
- [x] **P1.4**: Paid commands check `is_licensed()` before executing
- [x] **P1.5**: License key generator script (for selling keys)
- [x] **P1.6**: Valid keys shipped as a const hash set in the binary

**Status: ✅ DONE**

---

## Spec P2: `board ai` — AI Task Breakdown

**Goal**: `board ai "build auth"` → generates cards in the board. Users bring their own API key.

### Tasks

- [ ] **P2.1**: `board ai "<prompt>"` command (pro-only)
- [ ] **P2.2**: Reads `OPENAI_API_KEY` from env or `~/.board/config`
- [ ] **P2.3**: Calls OpenAI chat completions API with structured prompt
- [ ] **P2.4**: Parses JSON response into cards
- [ ] **P2.5**: Adds cards to the default board
- [ ] **P2.6**: `--dry-run` flag to preview without saving
- [ ] **P2.7**: Supports `--model` flag (default: gpt-4o-mini)

### Acceptance
```
export OPENAI_API_KEY=sk-...
board ai "Implement JWT auth with refresh tokens"
  → "Generated 6 tasks in tasks.board: ..."
board ai "ship MVP in 2 weeks" --dry-run
  → "Would create 12 tasks (dry run)"
```

---

## Spec P3: `board report` — Weekly Report Generator

**Goal**: `board report` generates a markdown summary of what happened this week.

### Tasks

- [ ] **P3.1**: `board report [--since "7 days ago"]` command (pro-only)
- [ ] **P3.2**: Shows: tasks completed, in progress, blocked, added
- [ ] **P3.3**: Outputs clean markdown ready for Twitter/LinkedIn/investor update
- [ ] **P3.4**: `--json` flag for machine-readable output
- [ ] **P3.5**: Groups by assignee and priority

### Acceptance
```
board report --since "7 days ago"
  → ## Weekly Report (Aug 1 - Aug 8)
  → **Completed (12)**: ...
  → **In Progress (5)**: ...
  → **Blocked (2)**: ...
```

---

## Spec P4: `board changelog`

**Goal**: Generate a changelog from completed tasks since the last git tag.

### Tasks

- [ ] **P4.1**: `board changelog [--since <ref>]` command (pro-only)
- [ ] **P4.2**: Finds all `done` cards since the specified git ref
- [ ] **P4.3**: Outputs markdown with links to cards, grouped by type
- [ ] **P4.4**: `--format json` for programmatic use
- [ ] **P4.5**: Detects last git tag automatically as the `since` ref

### Acceptance
```
board changelog
  → ## v0.3.0
  → ### Added: ... 
  → ### Fixed: ...
  → ### Changed: ...
```

---

## Spec P5: `board stats` — Analytics

**Goal**: Terminal analytics dashboard showing velocity and trends.

### Tasks

- [ ] **P5.1**: `board stats` command (pro-only)
- [ ] **P5.2**: Shows: cards completed per week, average cycle time, throughput
- [ ] **P5.3**: ASCII burndown chart in terminal
- [ ] **P5.4**: `--csv` flag for spreadsheet export
- [ ] **P5.5**: Color-coded output (green=good velocity, red=slowing)

### Acceptance
```
board stats
  → Weekly Velocity: 12.3 cards/week (↑ 2.1 from last week)
  → Avg Cycle Time: 2.3 days
  → Burndown: ████████░░░░ 67% complete
```

---

## Spec P6: Templates System

**Goal**: `board template saas-launch` creates a board with pre-built cards.

### Tasks

- [ ] **P6.1**: Templates stored in `~/.board/templates/` (YAML files)
- [ ] **P6.2**: `board template list` — shows available templates
- [ ] **P6.3**: `board template install <name>` — copies template cards to current board
- [ ] **P6.4**: Ship 5 initial templates: saas-launch, mobile-app, open-source, fundraising, hiring
- [ ] **P6.5**: Templates are plain YAML (editable, diffable, shareable)

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

- [ ] **P7.1**: Add pricing section to landing page (2 tiers: Pro $49, Team $149)
- [ ] **P7.2**: Feature comparison table (Free vs Pro vs Team)
- [ ] **P7.3**: Gumroad product set up with license key delivery
- [ ] **P7.4**: "Buy Now" buttons link to Gumroad checkout
- [ ] **P7.5**: Post-purchase: Gumroad delivers license key via email
- [ ] **P7.6**: Testimonials section with placeholder quotes
- [ ] **P7.7**: FAQ section

### Acceptance
Landing page at getboard.io shows pricing cards. Clicking "Buy Pro $49" opens Gumroad checkout. After purchase, user receives license key email.

---

## Spec P8: Sprint Commands

**Goal**: `board sprint start/end` for time-boxed planning.

- [ ] **P8.1**: `board sprint start <name>` — tags current `todo` cards as sprint items
- [ ] **P8.2**: `board sprint end` — moves remaining to next sprint, shows velocity
- [ ] **P8.3**: Sprint history stored for velocity calculations

---

## Spec P9: GitHub Issues Sync

**Goal**: `board sync` pushes cards to GitHub Issues.

- [ ] **P9.1**: `board sync --push` — creates GitHub Issues from cards
- [ ] **P9.2**: `board sync --pull` — imports GitHub Issues as cards
- [ ] **P9.3**: Two-way link stored in card metadata (`github_issue: 42`)

---

## Implementation Order

| # | Spec | Est. | Dependencies |
|---|---|---|---|
| P1 | License System | 3h | — |
| P2 | `board ai` | 3h | P1 |
| P3 | `board report` | 2h | P1 |
| P4 | `board changelog` | 2h | P1 |
| P5 | `board stats` | 2h | P1 |
| P6 | Templates | 2h | P1 |
| P7 | Landing v2 | 2h | P1 |
| P8 | Sprints | 3h | P1 |
| P9 | GitHub Sync | 3h | P1 |
