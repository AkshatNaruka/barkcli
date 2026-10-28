# SPEC-007 — Trust Layer: receipts, guard, risk-ranked review

**Status:** proposed
**Branch:** `feat/trust-layer`
**Depends:** SPEC-001..006
**Research:** `docs/internal/TRUST_LAYER_RESEARCH.md`
**Plan:** `PLAN-007-trust-layer.md`

## Goal

Make barkcli the place where agent work is **proven**, not just produced.

Three surfaces, one loop:

1. `barkcli guard` — a deterministic, offline scan of a diff before merge.
2. `barkcli receipt` — a verifiable record of what was merged and what was checked.
3. `barkcli review next` / `review queue` — risk-ranked review ordering.

Tagline: **"Agents write code. barkcli proves it."**

## Design rules

1. **Deterministic or it does not ship.** Guard checks are local, regex/AST-light,
   and repeatable. No network, no model calls, no hidden state.
2. **Evidence, not claims.** The gate and guard run outside the agent, in a
   checkout barkcli controls. The receipt records commands and results, not the
   agent's self-report.
3. **Explain every number.** Confidence and risk scores always carry the reasons
   that produced them. No unexplained "87".
4. **Advisory first.** Guard does not block merges by default in v1. Teams opt
   in with `guard.block = true` after seeing the numbers.
5. **Local-first.** Receipts live under `.board/`. Nothing is uploaded.
6. **Additive.** New config fields are `#[serde(default)]`; existing boards,
   runs, and scripts keep working.
7. **Secrets never persist.** Guard reports rule, path, and line — never the
   matched value. Evidence snippets pass through `util::redact`.

## Non-goals

- Orchestration, fleets, agent spawning.
- Hosted receipt storage, accounts, teams, billing.
- Semantic code review or LLM judging.
- Git history secret scanning (v1 scans the diff, not history).
- Blocking merges by default.
- Replacing `barkcli review <card>` (acceptance-criteria review). The new queue
  is additive and lives under subcommands.

## Architecture

```
                     ┌──────────────────────────────┐
  git diff ─────────▶│ guard/diff.rs  (DiffSet)      │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │ guard/checks.rs               │
                     │ secret · deps · patterns ·    │
                     │ tests · lockfile · size       │
                     └──────────────┬───────────────┘
                                    │ GuardReport
        run pipeline ───────────────┤
        (gate + merge)              │
                                    ▼
                     ┌──────────────────────────────┐
                     │ receipt/  (builder + store)   │
                     │ confidence + SHA-256          │
                     └──────────────┬───────────────┘
                                    │ Receipt
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
        CLI / MCP              HTTP API                web tab
                                    │
                     ┌──────────────▼───────────────┐
                     │ review_risk.rs               │
                     │ signals → score → tier       │
                     └──────────────────────────────┘
```

## Data model

All types are `serde` and live in `barkcli-core`.

### Guard

```rust
pub enum Severity { Info, Warn, Error }          // Ord: Info < Warn < Error

pub enum CheckId {
    Secret, UndeclaredDependency, SuspiciousDependency, LockfileDrift,
    DangerousPattern, MissingTests, DebugLeftover, LargeDiff,
}

pub struct GuardFinding {
    pub check: CheckId,
    pub severity: Severity,
    pub path: String,                 // "(diff)" for whole-diff findings
    pub line: Option<u32>,            // new-file line number
    pub message: String,
    pub evidence: Option<String>,     // redacted, truncated to 160 chars
    pub suggestion: Option<String>,
}

pub struct GuardReport {
    pub version: u32,                 // 1
    pub scanned_at: DateTime<Utc>,
    pub scope: String,                // "HEAD", "--cached", "main...HEAD"
    pub base: String,
    pub head: String,
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub findings: Vec<GuardFinding>,  // severity desc, path, line
    pub passed: bool,                 // no Error findings
}
```

### Diff

```rust
pub enum FileStatus { Added, Modified, Deleted, Renamed, Binary }

pub struct DiffLine { pub new_line: Option<u32>, pub old_line: Option<u32>, pub text: String }

pub struct ChangedFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub added: Vec<DiffLine>,
    pub removed: Vec<DiffLine>,
}

pub struct DiffSet {
    pub base: String,
    pub head: String,
    pub files: Vec<ChangedFile>,
    /// Full contents of changed, non-deleted, non-binary files at `head`.
    /// Loaded once by `diff_for_scope`; capped at 512 KB per file and 32 MB
    /// total. Dependency checks read this instead of re-shelling to git.
    pub contents: HashMap<String, String>,
}

impl DiffSet {
    pub fn content(&self, path: &str) -> Option<&str>;
}
```

### Receipt

```rust
pub enum ConfidenceLevel { Low, Medium, High }    // Ord: Low < Medium < High

pub struct AgentEvidence {
    pub provider: String,
    pub model: Option<String>,
    pub role: Option<String>,
    pub agent_id: Option<String>,
}

pub struct WorkspaceEvidence {
    pub branch: Option<String>,
    pub base_sha: Option<String>,
    pub head_sha: Option<String>,
    pub worktree: Option<String>,
}

pub struct DiffEvidence {
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub paths: Vec<String>,           // capped at 200, sorted
    pub test_files: Vec<String>,      // subset of paths
}

pub struct GateEvidence {
    pub command: Option<String>,
    pub passed: bool,
    pub skipped: bool,
    pub duration_ms: Option<u64>,
    pub log_path: Option<String>,
    pub tail: Option<String>,         // redacted, last 15 lines
    pub finished_at: Option<DateTime<Utc>>,
}

pub struct GuardEvidence {
    pub ran: bool,
    pub passed: bool,
    pub errors: u32,
    pub warnings: u32,
    pub findings: Vec<GuardFinding>,  // capped at 50
}

pub struct ReviewEvidence {
    pub open_comments: u32,
    pub resolved_comments: u32,
    pub viewed_files: u32,
    pub total_files: u32,
}

pub struct Confidence {
    pub level: ConfidenceLevel,
    pub reasons: Vec<String>,
}

pub struct Receipt {
    pub version: u32,                 // 1
    pub id: String,                   // "rcpt_<12 hex>"
    pub card_id: String,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub thread_id: Option<String>,
    pub intent: String,               // card title + first line of description
    pub agent: AgentEvidence,
    pub workspace: WorkspaceEvidence,
    pub diff: DiffEvidence,
    pub gate: GateEvidence,
    pub guard: GuardEvidence,
    pub tests_changed: bool,
    pub review: ReviewEvidence,
    pub confidence: Confidence,
    pub created_at: DateTime<Utc>,
    pub content_hash: String,         // sha256 hex, self-excluded
}
```

Receipts are immutable once written. A re-merge produces a new receipt.

### Risk

```rust
pub enum RiskTier { Must, Should, Skim, Unknown }

pub struct RiskReason { pub signal: String, pub points: u32, pub detail: String }

pub struct RiskAssessment {
    pub score: u32,                   // 0..=100
    pub tier: RiskTier,
    pub reasons: Vec<RiskReason>,
}

pub struct QueueItem {
    pub card_id: String,
    pub title: String,
    pub column: String,
    pub branch: Option<String>,
    pub receipt_id: Option<String>,
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub risk: RiskAssessment,
}
```

## Guard checks

Defaults run all checks. `guard.checks` selects a subset by id.

| Check | What it detects | Default severity | Notes |
|---|---|---|---|
| `secret` | Added lines matching redaction rules | Error | Reports rule id, never the value. Skips obvious placeholders. |
| `undeclared_dependency` | Import not declared in a reachable manifest | Warn | Rust, JS/TS, Python. Merges root + nearest manifest. |
| `suspicious_dependency` | Undeclared import within Levenshtein ≤2 of a declared name | Error | Slopsquatting / hallucination heuristic; suggests the near match. |
| `lockfile_drift` | Manifest changed, lockfile not | Warn | Cargo, npm/pnpm/yarn/bun, Poetry/uv/Pipenv. |
| `dangerous_pattern` | `shell=True`, `os.system`, TLS verify off, `--no-verify`, `curl \| sh`, `chmod 777` | Error for exec/TLS flags, Warn otherwise | Tight list, each with a rule id. |
| `missing_tests` | Production files changed and no test file changed | Warn | One finding per diff, not per file. Uses `code::tests::is_test_file`. |
| `debug_leftover` | `dbg!`, `debugger`, `binding.pry`, `console.log` in non-test files | Warn / Info | `console.log` is Info. |
| `large_diff` | Files > 40 or lines > 800 | Warn | Thresholds configurable. |

Guard resolution notes:

- **Scope:** `--staged` (`git diff --cached`), `--range <rev>` (any git range),
  or default `HEAD` (all tracked uncommitted changes). Untracked files are out
  of scope in v1 and documented as such.
- **Standalone:** guard works in any git repo. Without a `.board/` directory it
  uses `GuardSettings::default()`.
- **Import roots:** package name only (`@scope/name`, `serde`, `requests`).
  Relative imports, `crate::`, `self::`, `super::`, `std`/`core`/`alloc`,
  `node:` builtins, and a curated Python stdlib list are ignored.
- **Suppression (v1.1):** inline `// barkcli:ignore <check>` on the same line.
  Not required for v1, but the finding model already carries `path` + `line`.

## Receipt generation

### Sources

| Field | Source |
|---|---|
| card / intent | Board card (`read_board`) |
| task / run / thread | `TaskRequest`, `RunRecord`, session |
| agent | `RunRecord.provider/model/role/agent_id`, session backend |
| workspace | `RunRecord.base_sha/head_sha`, session branch/worktree, or `git rev-parse` |
| diff | `RunRecord.diff_stats` when present, else `git diff --numstat` against merge-base |
| gate | `GateResult` (run pipeline) or `GateSummary` (runtime v2) |
| guard | `GuardReport` run immediately before merge |
| review | `ReviewStore::from_project().load(&card_id)` |

Each merge path converts its own gate type into `GateEvidence`; the builder
takes `Option<GateEvidence>` and does not depend on command-layer types.

### Confidence

Pure function over a small input so it can be table-tested:

```rust
pub struct ConfidenceInput {
    pub gate_ran: bool,
    pub gate_passed: bool,
    pub guard_ran: bool,
    pub guard_errors: u32,
    pub guard_warnings: u32,
    pub production_changed: bool,
    pub tests_changed: bool,
    pub files: u32,
    pub lines: u32,
    pub open_comments: u32,
}
```

Start at `High`; each fired rule lowers the level and appends a reason. The
final level is the minimum.

| Rule | Level | Reason |
|---|---|---|
| Gate did not run | Low | "no acceptance gate ran" |
| Gate failed | Low | "acceptance gate failed" |
| Guard did not run | Medium | "guard scan not run" |
| Guard errors > 0 | Low | "{n} guard error finding(s)" |
| Guard warnings > 0 | Medium | "{n} guard warning(s)" |
| Production changed, no test changes | Medium | "production code changed without test changes" |
| Lines > 800 or files > 40 | Medium | "large diff ({files} files, {lines} lines)" |
| Open review comments > 0 | Low | "{n} unresolved review comment(s)" |
| Nothing fired | High | "gate passed, guard clean, tests updated" |

### Integrity

`content_hash` is SHA-256 over canonical JSON with the `content_hash` field
removed. Verification recomputes it and optionally checks that the branch head
still matches `workspace.head_sha`.

A receipt proves **process**, not correctness. The spec and UI must say so.

## Risk scoring

Signals are computed per candidate diff. Max 100.

| Signal | Points | Rule |
|---|---|---|
| Security-sensitive paths | 30 | Any changed path matches auth/session/token/oauth/crypto/payment/sql/exec/permission patterns. Markdown and `docs/` paths are excluded. |
| Complexity | 0–20 | Max cyclomatic of changed files: <10 → 0, 10–19 → 10, ≥20 → 20 |
| Missing tests | 20 | Production changed and no test file changed |
| Churn | 0–15 | Lines: ≤50 → 0, 51–300 → 8, 301–800 → 12, >800 → 15 |
| Public API | 10 | Added `pub fn/struct/enum/trait` or JS/TS `export` declaration |
| Size | 0–5 | Files: ≤3 → 0, 4–10 → 3, >10 → 5 |

Tiers: **Must** ≥70, **Should** ≥40, **Skim** <40, **Unknown** when no diff can
be resolved. Every nonzero contribution adds a `RiskReason` with file names or
counts. `review next` prints the top reasons.

## CLI surface

```
barkcli guard [--staged | --range <rev>] [--json] [--strict] [--quiet]
barkcli receipt list [--card <id>] [--json]
barkcli receipt show <id|card> [--json | --md]
barkcli receipt create --card <id> [--run <id>] [--branch <b>] [--json]
barkcli receipt verify <id|card> [--rerun-gate] [--json]
barkcli review queue [--board <n>] [--all] [--json] [--limit N]
barkcli review next [--board <n>] [--json]
```

Exit codes for `guard`: `0` clean or warnings only, `1` error findings (or any
finding with `--strict`), `2` usage or operational error. `--quiet` prints only
the summary line.

`review queue` defaults to cards in the `review` column; `--all` includes
`doing`. Cards without a resolvable branch or receipt appear as `Unknown` and
sort last.

## Storage

```
.board/
├── receipts/
│   ├── rcpt_ab12cd34ef56.json
│   └── rcpt_ab12cd34ef56.md
├── reviews/<id>.json          # existing
├── runs/<run_id>.json         # existing
└── verify.json                # existing
```

Writes are atomic (temp file + rename), matching `ReviewStore`. `list()` reads
`*.json`; `latest_for(card)` picks the newest `created_at`; `get(id_or_card)`
prefers an exact id and falls back to the latest receipt for a card. Both
formats are written on save; markdown is derived, never hand-edited.

## Integration points

### Run pipeline (`commands/run_cmd.rs`)

In `handle_done`, after the gate passes and before `git merge`:

1. Resolve `root = find_project_root()`.
2. `guard::scan_branch(&root, &branch)` over `merge-base..branch`.
3. Print a one-line guard summary.
4. If `config.guard.block && !report.passed`: do **not** merge. Emit a
   `ready-unmerged` outcome with the finding digest, keep the branch, and do not
   retry (a human decides).
5. On successful merge, build and save a receipt. A receipt failure logs a
   warning and never fails the merge.

Add `duration_ms` to `GateResult` (measured in `run_gate`) so the receipt can
report it.

### Runtime v2 (`runtime/runner.rs`)

`RunService::merge` is the server/web merge path. After a successful merge and
before releasing the worktree:

1. Run `guard::scan_branch(&root, &branch)`.
2. Convert the `RunRecord` gate summary, base/head SHAs, and diff stats into a
   receipt.
3. Save the receipt and include its id in the `RuntimeEvent::Merged` payload.

Receipt failure logs and never fails the merge. `approved: false` still refuses
the merge before any of this runs.

### `barkcli merge`

`barkcli merge` merges **board YAML**, not git branches. It is out of scope and
must not be wired to guard or receipts.

### `barkcli done`

Leaving the card-moving path untouched. Retroactive receipts come from
`receipt create`.

### Server

| Method | Route | Returns |
|---|---|---|
| GET | `/api/receipts?card_id=` | `{ receipts: ReceiptSummary[] }` |
| GET | `/api/receipts/{id}` | `{ receipt, markdown }` |
| POST | `/api/receipts/{id}/verify` | `{ valid, hash_ok, branch_moved, gate? }` |
| POST | `/api/guard/scan` | `GuardReport` (body: `{ range?, staged? }`) |
| GET | `/api/review/queue?board=&all=` | `{ items: QueueItem[] }` |

Auth follows the existing token middleware. Handlers stay thin: parse, call
core, return JSON.

### MCP

New tools: `guard_scan`, `receipt_list`, `receipt_get`, `receipt_verify`,
`review_queue`. All return JSON; `receipt_get` includes a `markdown` field.
Arguments mirror the CLI flags. Descriptions must say when to use them
("before merging agent work", "after a merge", "when deciding what to review").

### Web

- **Inspector pane:** new `Receipt` tab between `Gate` and `Eval`. Shows a
  confidence badge, reasons, gate row, guard findings grouped by severity, diff
  stats, review state, and a "Verify" action. Empty state explains that a
  receipt is written on merge.
- **Board:** a `Review queue` button in the board header opens a panel listing
  `QueueItem`s with tier, score, top reason, and a jump to the card/receipt.

## Config

Add to `.board/config.json` (all optional):

```json
{
  "guard": {
    "enabled": true,
    "block": false,
    "checks": ["secret", "undeclared_dependency", "suspicious_dependency",
               "lockfile_drift", "dangerous_pattern", "missing_tests",
               "debug_leftover", "large_diff"],
    "large_diff_files": 40,
    "large_diff_lines": 800
  },
  "receipts": {
    "auto": true
  }
}
```

Rust:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardSettings { /* fields above, with defaults */ }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptSettings { pub auto: bool }

pub struct Config {
    // existing fields...
    #[serde(default)] pub guard: GuardSettings,
    #[serde(default)] pub receipts: ReceiptSettings,
}
```

`block: false` is deliberate. Flip the default only after a release of
precision data.

## Security and privacy

- Secret findings store the rule id and location, never the value. Snippets are
  redacted with `util::redact::redact_text` before persistence.
- Receipts can contain file paths and gate output. They stay under `.board/`
  (gitignored). `--md` is the explicit sharing path.
- `receipt verify --rerun-gate` executes the recorded command. It requires the
  explicit flag and prints the command before running it.
- Guard reads repository files only; no network, no subprocess beyond `git`.

## Performance

- Target: < 2s for a 50-file diff, < 10s for 500 files on a laptop.
- Cap file reads at 512 KB; skip binary and minified files.
- Read file contents once per changed file; cache manifest lookups per
  directory.
- Receipt writes are O(1); listing caps at the newest 1,000 files.

## Rollout

1. Land behind defaults that change nothing: guard advisory, receipts on merge
   (local only), queue additive.
2. Dogfood on barkcli itself for one week; record guard precision per check.
3. Demote any check below 80% precision to `Info`/`Warn`.
4. Announce `guard.block = true` as the recommended team setting.
5. Consider `receipt export` to a committed `receipts/` directory only after
   teams ask for it.

## Acceptance criteria

- [ ] `barkcli guard` in a temp repo finds a planted secret, an undeclared
      dependency, and `shell=True`; exits `1`; `--json` parses.
- [ ] `barkcli guard --strict` exits `1` on a warning-only diff; without it,
      exits `0`.
- [ ] A passing run with `--yes` writes `.board/receipts/<id>.json` and `.md`.
- [ ] `barkcli receipt verify <id>` returns valid; editing any field makes it
      invalid.
- [ ] Confidence follows the table: no gate → Low; guard warnings → Medium;
      clean gate + clean guard + tests → High.
- [ ] `barkcli review next` ranks a security-path diff above a docs-only diff.
- [ ] Risk reasons are non-empty for every score > 0.
- [ ] Server routes return the same data as the CLI; web receipt tab renders it.
- [ ] `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`,
      `cd web && npm test`, `cd web && npm run build` all pass.
- [ ] No new runtime dependencies in `barkcli-core`.

## Open questions

1. Should a blocked guard merge consume an attempt? **No** — it returns
   `ready-unmerged` and preserves the branch.
2. Should receipts be committed? **Not in v1.** Export markdown instead.
3. Should `review queue` include open PRs? **No.** It reads cards and branches.
4. Should guard scan deleted lines for secrets? **No.** Removing a secret is
   good; deleting one still leaves it in history, which is out of scope.
5. Should confidence include agent token usage/cost? **Not yet.** It is evidence,
   not trust.
