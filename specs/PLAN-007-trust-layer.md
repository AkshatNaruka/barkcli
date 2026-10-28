# PLAN-007 — Trust Layer implementation plan

> **For the implementing agent:** work phase by phase. Every task is TDD:
> write the failing test, run it, implement, run it again. Do not start the
> next phase until the current phase's verification passes. Commit at the end
> of each phase. If a test cannot be written first (glue code), say so in the
> commit body.

**Goal:** ship `barkcli guard`, `barkcli receipt`, and `barkcli review queue`
as one trust loop on top of the existing worktree + gate pipeline.

**Spec:** `specs/SPEC-007-trust-layer.md`
**Research:** `docs/internal/TRUST_LAYER_RESEARCH.md`
**Branch:** `feat/trust-layer`
**Estimated size:** 4,000–5,000 LOC including tests.
**New dependencies:** none. `sha2`, `regex`, `serde_json`, `walkdir` are
already in `barkcli-core`. Do not add `toml`; parse the small manifest surface
we need with line scanning.

## File map

**New**

```
barkcli-core/src/guard/mod.rs          report types + scan orchestration
barkcli-core/src/guard/diff.rs         unified-diff parser + git scopes
barkcli-core/src/guard/deps.rs         import/manifest extraction, Levenshtein
barkcli-core/src/guard/checks.rs       individual checks
barkcli-core/src/receipt/mod.rs        model, hash, store, markdown
barkcli-core/src/receipt/builder.rs    assembly + confidence
barkcli-core/src/review_risk.rs        risk signals + scoring
barkcli-core/src/commands/guard.rs     CLI
barkcli-core/src/commands/receipt.rs   CLI
barkcli-core/src/commands/review_queue.rs  CLI
web/src/components/ReceiptPanel.tsx
web/src/components/ReviewQueuePanel.tsx
```

**Modified**

```
barkcli-core/src/lib.rs
barkcli-core/src/models/config.rs
barkcli-core/src/commands/mod.rs
barkcli-core/src/commands/review.rs
barkcli-core/src/commands/run_cmd.rs
barkcli-core/src/runtime/runner.rs
barkcli-core/src/cli.rs
barkcli-core/src/util/redact.rs
barkcli-core/src/mcp.rs
barkcli-server/src/lib.rs
barkcli-cli/tests/cli.rs
web/src/lib/types.ts
web/src/lib/api.ts
web/src/shell/InspectorPane.tsx
web/src/shell/InspectorPane.test.tsx
web/src/components/BoardView.tsx
README.md
docs/content/COMMANDS.md
docs/content/MCP_AGENTS.md
specs/README.md
```

---

## Phase 0 — Baseline and scaffolding

### Task 0.1 — Record the baseline

Run, from the repo root:

```bash
cargo test --workspace --quiet
cargo clippy --workspace --all-targets --quiet -- -D warnings
cd web && npm test
cd web && npm run build
```

Write any pre-existing failures into the PR description, not into a file.
Do not fix unrelated failures. All later phases must not add new ones.

### Task 0.2 — Config fields and module registration

**Files:** `barkcli-core/src/models/config.rs`, `barkcli-core/src/lib.rs`,
`barkcli-core/src/commands/mod.rs`

**Interfaces:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardSettings {
    pub enabled: bool,
    pub block: bool,
    pub checks: Vec<String>,
    pub large_diff_files: u32,
    pub large_diff_lines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptSettings {
    pub auto: bool,
}

impl Default for GuardSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            block: false,
            checks: vec![
                "secret".into(), "undeclared_dependency".into(),
                "suspicious_dependency".into(), "lockfile_drift".into(),
                "dangerous_pattern".into(), "missing_tests".into(),
                "debug_leftover".into(), "large_diff".into(),
            ],
            large_diff_files: 40,
            large_diff_lines: 800,
        }
    }
}
```

Add `#[serde(default)] pub guard: GuardSettings` and
`#[serde(default)] pub receipts: ReceiptSettings` to `Config`. Add both to
`Config::default()`.

**Tests (in `models/config.rs`):**

- `old_config_without_trust_fields_deserializes`
- `guard_defaults_are_advisory` (`block == false`, 8 checks)
- `trust_config_roundtrips`

Register empty modules: `pub mod guard; pub mod receipt; pub mod review_risk;`
in `lib.rs`, and `pub mod guard; pub mod receipt; pub mod review_queue;` in
`commands/mod.rs`. Create the files with a doc comment and no items yet.

**Verify:** `cargo test -p barkcli-core models::config && cargo build`
**Commit:** `feat(config): add guard and receipt settings`

---

## Phase 1 — Diff engine

### Task 1.1 — `DiffScope` and `DiffSet`

**Files:** `barkcli-core/src/guard/diff.rs`, `barkcli-core/src/guard/mod.rs`

**Interfaces:**

```rust
pub enum DiffScope { Worktree, Staged, Range(String) }

pub struct DiffLine { pub old_line: Option<u32>, pub new_line: Option<u32>, pub text: String }

pub enum FileStatus { Added, Modified, Deleted, Renamed, Binary }

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
    pub contents: HashMap<String, String>,   // changed files at `head`
}

impl DiffSet {
    pub fn content(&self, path: &str) -> Option<&str>;
}

pub fn parse_unified_diff(text: &str) -> Vec<ChangedFile>;
pub fn diff_for_scope(root: &Path, scope: &DiffScope) -> Result<DiffSet>;
```

**Implementation notes:**

- Run `git -C <root> diff -U0 --no-color --find-renames <range> --`.
  - `Worktree` → `HEAD`
  - `Staged` → `--cached`
  - `Range(r)` → `r`
- Parse `diff --git`, `new file mode`, `deleted file mode`, `rename from/to`,
  `---`, `+++`, `@@ -a,b +c,d @@`, and `+`/`-` body lines.
- Do not treat `+++`/`---` headers as body lines.
- Handle `\ No newline at end of file`.
- Treat `Binary files ... differ` and `GIT binary patch` as `FileStatus::Binary`.
- Strip the `b/` prefix; keep `old_path` for renames.
- If `HEAD` does not exist (empty repo), return an empty `DiffSet` instead of
  failing.
- After parsing, load `contents`: skip deleted and binary files; for
  `Worktree`/`Staged` read `root.join(path)`, for `Range` run
  `git show <head>:<path>`. Skip files over 512 KB, stop at 32 MB total, and
  skip non-UTF-8 content.

**Tests:**

- `parses_added_lines_with_new_line_numbers`
- `parses_removals_and_modifications`
- `parses_new_deleted_and_renamed_files`
- `parses_binary_marker`
- `ignores_header_lines_beginning_with_plus`
- `worktree_scope_includes_staged_changes` (temp git repo)
- `range_scope_uses_both_refs` (temp git repo)
- `empty_repo_returns_empty_set`
- `loads_contents_for_changed_text_files`
- `skips_binary_and_deleted_contents`

**Verify:** `cargo test -p barkcli-core guard::diff`
**Commit:** `feat(guard): unified diff parser and scopes`

---

## Phase 2 — Guard checks

### Task 2.1 — Expose secret rules without changing redaction

**Files:** `barkcli-core/src/util/redact.rs`, `barkcli-core/src/guard/checks.rs`

Refactor the existing `RULES` into:

```rust
pub struct SecretRule {
    pub id: &'static str,
    pub regex: Regex,
    pub replacement: String,
}

pub fn secret_rules() -> &'static [SecretRule];

pub struct SecretHit { pub rule: &'static str, pub start: usize, pub len: usize }
pub fn detect_secrets(text: &str) -> Vec<SecretHit>;
```

Keep `redact_text` behavior byte-identical. Assign ids:
`openai_key`, `github_token`, `github_pat`, `aws_access_key`, `bearer_token`,
`db_url_credentials`, `kv_assignment`, `authorization_header`.

**Tests:**

- All existing redaction tests still pass.
- `detect_secrets_reports_rule_ids`
- `detect_secrets_finds_multiple_rules`
- `plain_text_has_no_hits`

**Commit:** folded into the guard commit.

### Task 2.2 — Dependency extraction and manifests

**Files:** `barkcli-core/src/guard/deps.rs`

**Interfaces:**

```rust
pub struct DeclaredDeps {
    pub rust: HashSet<String>,
    pub js: HashSet<String>,
    pub python: HashSet<String>,
}

pub struct ImportRef { pub name: String, pub line: u32 }

pub fn collect_declared(root: &Path, file: &Path) -> DeclaredDeps;
pub fn imports_in(path: &str, content: &str) -> Vec<ImportRef>;
pub fn levenshtein(a: &str, b: &str) -> usize;
```

**Implementation notes:**

- Rust: `use foo::...` and `extern crate foo`; ignore `crate`, `self`, `super`,
  `std`, `core`, `alloc`.
- JS/TS: `from "x"`, `require("x")`, dynamic `import("x")`; skip relative
  paths and `node:` builtins; package name is `@scope/name` or the first
  segment.
- Python: `import x`, `from x import`; skip relative dots and a curated stdlib
  set (`os`, `sys`, `json`, `re`, `pathlib`, `typing`, `datetime`, `math`,
  `subprocess`, `collections`, `itertools`, `functools`, `dataclasses`,
  `unittest`, `pytest` is *not* stdlib — leave it checked).
- Manifests: `Cargo.toml` (dependency sections, line scan), `package.json`
  (`serde_json`), `requirements.txt`, `pyproject.toml` (best effort).
- Merge declarations from the repo root manifest and the nearest ancestor
  manifest up to the root. Cap at 3 levels.
- `levenshtein` is a standard two-row DP; add tests for empty strings,
  transposition distance 2, and equal strings.
- `check_dependencies` reads `ctx.diff.content(path)`. Never re-read from disk
  or shell out per file; that is why `DiffSet` carries contents.

**Tests:**

- `extracts_rust_imports_and_ignores_stdlib`
- `extracts_scoped_js_packages`
- `extracts_python_imports`
- `reads_cargo_dependency_sections`
- `reads_package_json_dependency_groups`
- `reads_requirements_and_pyproject`
- `levenshtein_basics`

**Commit:** folded into the guard commit.

### Task 2.3 — Danger, debug, tests, lockfile, size checks

**Files:** `barkcli-core/src/guard/checks.rs`

Pure functions over `&DiffSet` plus a `CheckContext`:

```rust
pub struct CheckContext<'a> {
    pub root: &'a Path,
    pub diff: &'a DiffSet,
    pub large_files: u32,
    pub large_lines: u32,
}

pub fn check_secrets(ctx: &CheckContext) -> Vec<GuardFinding>;
pub fn check_dependencies(ctx: &CheckContext) -> Vec<GuardFinding>;
pub fn check_dangerous_patterns(ctx: &CheckContext) -> Vec<GuardFinding>;
pub fn check_debug_leftovers(ctx: &CheckContext) -> Vec<GuardFinding>;
pub fn check_missing_tests(ctx: &CheckContext) -> Vec<GuardFinding>;
pub fn check_lockfile_drift(ctx: &CheckContext) -> Vec<GuardFinding>;
pub fn check_large_diff(ctx: &CheckContext) -> Vec<GuardFinding>;
```

Rules:

- `check_dependencies` emits `undeclared_dependency` (Warn) and
  `suspicious_dependency` (Error) when the undeclared name is within
  Levenshtein ≤ 2 of a declared name (min length 4).
- `check_missing_tests`: if any non-test production file changed and no changed
  file satisfies `code::tests::is_test_file`, emit one Warn finding at
  `path = "(diff)"`.
- `check_lockfile_drift`: manifest changed and the matching lockfile exists at
  the repo root but is not in the diff.
- `check_large_diff`: Warn when files > `large_files` or lines > `large_lines`.
- Debug leftovers: `dbg!`, `debugger`, `binding.pry` → Warn; `console.log` →
  Info; skip test files.
- Every evidence snippet goes through `redact_text` and is truncated to 160
  chars. Secret findings never include the value.

**Tests (table-driven):**

- `detects_shell_true_as_error`
- `detects_tls_verification_disabled`
- `detects_curl_pipe_shell`
- `does_not_flag_unwrap`
- `detects_dbg_outside_tests_only`
- `missing_tests_emits_one_finding`
- `lockfile_drift_requires_existing_lockfile`
- `large_diff_thresholds`
- `secret_finding_never_contains_value`

**Commit:** folded into the guard commit.

### Task 2.4 — Report assembly

**Files:** `barkcli-core/src/guard/mod.rs`

**Interfaces:**

```rust
pub struct GuardOptions {
    pub root: PathBuf,
    pub scope: DiffScope,
    pub checks: Vec<CheckId>,
    pub large_files: u32,
    pub large_lines: u32,
}

pub fn scan(opts: &GuardOptions) -> Result<GuardReport>;
pub fn scan_branch(root: &Path, branch: &str) -> Result<GuardReport>;
```

`scan_branch` computes `merge-base HEAD <branch>` and scans
`<merge_base>..<branch>`.

Assembly:

1. Parse the diff.
2. Run selected checks.
3. Sort findings by severity desc, then path, then line.
4. `passed = no Error findings`.
5. Populate `files`, `additions`, `deletions`, `base`, `head`, `scope`.

**Tests:**

- `scan_reports_files_and_totals`
- `findings_sorted_by_severity_then_path`
- `passed_false_only_with_errors`
- `scan_branch_uses_merge_base` (temp repo with two branches)
- `disabled_checks_are_not_run`

**Verify:** `cargo test -p barkcli-core guard::`
**Commit:** `feat(guard): deterministic checks and report`

---

## Phase 3 — Guard CLI

### Task 3.1 — `barkcli guard`

**Files:** `barkcli-core/src/commands/guard.rs`,
`barkcli-core/src/commands/mod.rs`, `barkcli-core/src/cli.rs`,
`barkcli-cli/tests/cli.rs`

Parse `--staged`, `--range <rev>`, `--json`, `--strict`, `--quiet`. Reject
`--staged` + `--range` together with exit code 2.

Load config with `find_board_dir_opt()`; if there is no `.board` or the file
is missing, use `GuardSettings::default()`. `barkcli guard` must work in a
plain git repo without `barkcli init`.

Output:

```
Guard  main...feat/x  4 files  +128 -21
  ERROR src/auth.rs:42  secret: openai_key
  WARN  package.json    undeclared_dependency: left-pad
2 findings (1 error, 1 warning)
```

`--json` prints the `GuardReport`. `--quiet` prints only the last line.
Exit `1` when `!report.passed` or (`--strict` and any Warn); otherwise `0`.

**Tests in `barkcli-cli/tests/cli.rs`:**

Add helpers `init_git(dir)` (init, user config, one commit) and
`commit_file(dir, path, body)`.

- `guard_clean_diff_exits_zero`
- `guard_secret_exits_one_and_json_parses`
- `guard_strict_promotes_warnings`
- `guard_rejects_conflicting_scopes`

**Verify:** `cargo test -p barkcli-cli --test cli guard_`
**Commit:** `feat(guard): CLI with CI-friendly exit codes`

---

## Phase 4 — Receipt model and store

### Task 4.1 — Types, hash, markdown, store

**Files:** `barkcli-core/src/receipt/mod.rs`, `barkcli-core/src/lib.rs`

Implement the types from SPEC-007 §Data model.

```rust
impl Receipt {
    pub fn new_id() -> String;              // rcpt_<12 hex>
    pub fn compute_hash(&self) -> Result<String>;
    pub fn verify_hash(&self) -> Result<bool>;
    pub fn to_markdown(&self) -> String;
}

pub struct ReceiptStore { /* .board/receipts */ }
impl ReceiptStore {
    pub fn from_project() -> Result<Self>;
    pub fn new(dir: impl Into<PathBuf>) -> Self;
    pub fn save(&self, receipt: &Receipt) -> Result<PathBuf>;
    pub fn load(&self, id: &str) -> Result<Receipt>;
    pub fn get(&self, id_or_card: &str) -> Result<Receipt>;
    pub fn list(&self) -> Result<Vec<Receipt>>;
    pub fn latest_for(&self, card_id: &str) -> Result<Option<Receipt>>;
}
```

Hash: `serde_json::to_value(self)` → remove `content_hash` → `to_vec` → SHA-256
→ lowercase hex. JSON object keys are sorted by `serde_json`'s default map, so
the bytes are stable.

Markdown sections: title + confidence, intent, agent, workspace, diff, gate,
guard, review, integrity. Never include raw gate output beyond the redacted
tail.

**Tests:**

- `receipt_roundtrips`
- `hash_is_stable_across_serialization`
- `editing_a_field_invalidates_hash`
- `store_latest_for_picks_newest`
- `store_get_falls_back_to_card`
- `markdown_contains_confidence_and_hash`
- `slug_prevents_path_traversal`

**Verify:** `cargo test -p barkcli-core receipt::`
**Commit:** `feat(receipt): hashable model, markdown, and store`

---

## Phase 5 — Builder, confidence, CLI, merge integration

### Task 5.1 — Builder and confidence

**Files:** `barkcli-core/src/receipt/builder.rs`

**Interfaces:**

```rust
pub struct ReceiptInput<'a> {
    pub card: &'a Card,
    pub task: Option<&'a TaskRequest>,
    pub session: Option<&'a Session>,
    pub run: Option<&'a RunRecord>,
    pub gate: Option<GateEvidence>,
    pub guard: Option<&'a GuardReport>,
    pub review: Option<&'a ReviewState>,
    pub branch: Option<&'a str>,
    pub repo_root: &'a Path,
}

pub fn build(input: &ReceiptInput) -> Result<Receipt>;

pub struct ConfidenceInput { /* spec fields */ }
pub fn evaluate_confidence(input: &ConfidenceInput) -> Confidence;
```

Diff fallback: when `run.diff_stats` is zero, run
`git diff --numstat <merge_base>..<branch>` and `--name-only`. Cap `paths` at
200. `test_files` uses `code::tests::is_test_file`.

Gate duration: add `pub duration_ms: u64` to `GateResult` in
`commands/run_cmd.rs` and set it in `run_gate` with `Instant`.

Each call site builds `GateEvidence` itself:
`run_cmd` from `GateResult`, `runtime::runner` from `GateSummary`. The builder
stays free of command-layer types.

**Tests:**

- `confidence_table` — one case per rule plus the clean case.
- `confidence_takes_the_minimum`
- `builder_uses_run_stats_when_present`
- `builder_falls_back_to_git`
- `builder_caps_paths`
- `builder_marks_test_files`

**Commit:** folded into Phase 5 commit.

### Task 5.2 — `barkcli receipt` CLI

**Files:** `barkcli-core/src/commands/receipt.rs`,
`barkcli-core/src/commands/mod.rs`, `barkcli-core/src/cli.rs`

Subcommands: `list`, `show`, `create`, `verify`.

- `create --card <id> [--run <id>] [--branch <b>]`: read the board, find the
  card, load the run (`RuntimeStore::load_run`) or the newest run whose
  `card_id` matches, and load the review state. Guard evidence is absent for
  retroactive receipts, so `guard.ran = false` and confidence drops to Medium.
  Build and save.
- `show <id|card>`: human summary; `--md` prints markdown; `--json` prints JSON.
- `verify <id|card> [--rerun-gate]`: recompute hash, compare
  `workspace.head_sha` with `git rev-parse <branch>` when possible, optionally
  run the gate command. Exit `1` on invalid.

**Tests (kept in `commands/receipt.rs`):**

- `create_requires_card`
- `show_prefers_exact_id`
- `verify_detects_tampering`
- `verify_reports_branch_moved`

**Commit:** `feat(receipt): builder, confidence, and CLI`

### Task 5.3 — Merge integration

**Files:** `barkcli-core/src/commands/run_cmd.rs`

In `handle_done`, successful-merge branch (around the current
`git merge --no-ff` block):

1. Before merging, run `guard::scan_branch(&root, &branch)`.
2. Print `Guard: N findings (E errors, W warnings)`.
3. If `config.guard.block && !report.passed`: emit a `ready-unmerged` outcome
   with `note = "guard blocked merge: N error(s)"`, keep the branch, do not
   requeue, return `SoloClear`.
4. After the merge succeeds, resolve the card with
   `find_card(board_name, &task.card_id)`, build a receipt with the guard
   report and the card/session/gate, save it, and print
   `Receipt: .board/receipts/<id>.json`.
5. Any receipt error is logged and ignored; the merge stands.

Read config once at the start of `run()` and pass `GuardSettings` into
`handle_done` (add a parameter rather than re-reading per task).

**Tests:**

- `handle_done_blocked_guard_keeps_branch` — extract the decision into a pure
  `fn should_block_merge(settings: &GuardSettings, report: &GuardReport) -> bool`
  and unit-test it.
- Integration test for the full merge path is out of scope; the builder and
  guard are covered separately.

**Verify:** `cargo test -p barkcli-core receipt:: guard:: run_cmd::`
**Commit:** `feat(receipt): write receipts on merge and honor guard block`

### Task 5.4 — Runtime v2 merge integration

**Files:** `barkcli-core/src/runtime/runner.rs`

`RunService::merge` is the server/web path. After `git merge` succeeds and
before `release_worktree`:

1. Run `guard::scan_branch(&root, &branch)`.
2. Build `GateEvidence` from `run.gate` (`GateSummary`), and a receipt from the
   `RunRecord` + card + guard report + review state.
3. Save the receipt and add `receipt_id` to the `RuntimeEvent::Merged` payload.
4. Log and ignore receipt failures, as in Task 5.3.

**Tests:**

- `gate_evidence_from_summary_maps_fields`
- `merge_refuses_before_receipt_work_when_not_approved` (existing behavior,
  assert no receipt file is written)

**Verify:** `cargo test -p barkcli-core runtime::runner receipt::`
**Commit:** `feat(receipt): write receipts on runtime-v2 merge`

---

## Phase 6 — Risk scoring and review queue

### Task 6.1 — `review_risk.rs`

**Files:** `barkcli-core/src/review_risk.rs`, `barkcli-core/src/lib.rs`

**Interfaces:**

```rust
pub struct RiskFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub cyclomatic: usize,
    pub touches_public_api: bool,
}

pub struct RiskInput {
    pub files: Vec<RiskFile>,
    pub production_changed: bool,
    pub tests_changed: bool,
}

pub fn assess(input: &RiskInput) -> RiskAssessment;
```

Signals and weights exactly as SPEC-007 §Risk scoring. Security path regexes:
`auth|session|token|oauth|password|secret|crypto|payment|billing|sql|exec|permission|acl|admin`.
Public API: added lines starting with `pub fn|pub struct|pub enum|pub trait`
or JS/TS `export`.

**Tests:**

- `clean_small_diff_is_skim`
- `auth_file_hits_must_tier`
- `security_dominates_large_docs_diff`
- `missing_tests_adds_twenty`
- `tier_boundaries` (39/40, 69/70)
- `reasons_match_points`
- `no_files_is_unknown`

**Commit:** folded into Phase 6 commit.

### Task 6.2 — Queue builder and CLI

**Files:** `barkcli-core/src/commands/review_queue.rs`,
`barkcli-core/src/commands/review.rs`, `barkcli-core/src/commands/mod.rs`,
`barkcli-core/src/cli.rs`

In `run_review`, intercept `queue` and `next` before the existing card-id
parsing and delegate.

Queue build:

1. Read the board. Candidates = cards in `review`; `--all` adds `doing`.
2. Resolve branch: latest receipt → newest session for the card's tasks →
   `bark/<card_id>` if it exists.
3. Resolve `merge_base`, reuse
   `guard::diff::diff_for_scope(root, DiffScope::Range("<merge_base>...<branch>"))`,
   compute `compute_metrics` from `diff.content(path)`, and build `RiskFile`s
   from the parsed diff. Do not write a second diff parser.
4. `assess`, sort by tier (Must > Should > Skim > Unknown) then score desc.
5. `--json` prints `Vec<QueueItem>`; human output is a table plus top reason.
6. `next` prints the first non-skim item with reasons and three commands:
   `barkcli receipt show <card>`, `barkcli review <card>`, `git diff`.

**Tests:**

- `queue_empty_board_returns_empty`
- `queue_sorts_must_before_skim`
- `queue_marks_unknown_without_branch`
- `next_skips_skim_when_possible`

**Verify:** `cargo test -p barkcli-core review_risk:: commands::review_queue`
**Commit:** `feat(review): risk-ranked queue and next`

---

## Phase 7 — MCP tools

**Files:** `barkcli-core/src/mcp.rs`

Add five tools to the tool list and dispatch:

| Tool | Arguments | Returns |
|---|---|---|
| `guard_scan` | `board?`, `range?`, `staged?` | `GuardReport` |
| `receipt_list` | `board?`, `card_id?` | `{ receipts: ReceiptSummary[] }` |
| `receipt_get` | `id_or_card`, `board?` | `{ receipt, markdown }` |
| `receipt_verify` | `id_or_card`, `rerun_gate?` | verification result |
| `review_queue` | `board?`, `all?`, `limit?` | `{ items }` |

Follow the `tool_verify` pattern: resolve the board, call the same core
functions as the CLI, return `serde_json::json!`.

**Tests:**

- `tool_list_contains_trust_tools`
- `tool_guard_scan_rejects_unknown_range` (returns a JSON error, not a panic)
- `tool_receipt_get_missing_returns_error`

**Verify:** `cargo test -p barkcli-core mcp::`
**Commit:** `feat(mcp): expose guard, receipts, and review queue`

---

## Phase 8 — Server routes

**Files:** `barkcli-server/src/lib.rs`

Add the five routes from SPEC-007 §Server. Place them next to the existing
`/api/reviews` routes.

Handlers stay thin:

```rust
async fn list_receipts_handler(Query(q): Query<ReceiptQuery>) -> Result<Json<Value>, ApiError>
async fn get_receipt_handler(Path(id): Path<String>) -> Result<Json<Value>, ApiError>
async fn verify_receipt_handler(Path(id): Path<String>, Json(req): Json<VerifyReceiptReq>) -> ...
async fn guard_scan_handler(Json(req): Json<GuardScanReq>) -> ...
async fn review_queue_handler(Query(q): Query<QueueQuery>) -> ...
```

Use the existing error type and `State<Arc<AppState>>` if the board name is
needed.

**Tests:**

Add a `with_temp_project` helper in the test module:

```rust
static CWD_LOCK: Mutex<()> = Mutex::new(());

fn with_temp_project<T>(f: impl FnOnce() -> T) -> T {
    let _guard = CWD_LOCK.lock().unwrap();
    let dir = /* temp dir + .board/config.json + git init + commit */;
    let prev = std::env::current_dir().unwrap();
    std::env::set_current_dir(&dir).unwrap();
    let out = f();
    std::env::set_current_dir(prev).unwrap();
    out
}
```

- `receipts_route_is_registered` (200 with empty list, not 404)
- `receipt_routes_require_auth` (401 without token)
- `guard_scan_rejects_both_range_and_staged`
- `review_queue_returns_json_array`

**Verify:** `cargo test -p barkcli-server`
**Commit:** `feat(server): receipt, guard, and review queue endpoints`

---

## Phase 9 — Web receipt tab

**Files:** `web/src/lib/types.ts`, `web/src/lib/api.ts`,
`web/src/components/ReceiptPanel.tsx`,
`web/src/shell/InspectorPane.tsx`, `web/src/shell/InspectorPane.test.tsx`

1. Add `Receipt`, `ReceiptSummary`, `GuardFinding`, `ConfidenceLevel` to
   `types.ts`, mirroring the Rust wire format.
2. Add `fetchReceipt(cardId)` and `verifyReceipt(id)` to `api.ts`. Follow the
   existing `fetchReview` error handling.
3. `ReceiptPanel` props: `{ receipt: Receipt | null; loading: boolean; onVerify: () => void }`.
   Render confidence badge (High green, Medium amber, Low red), reasons, gate
   row, guard findings grouped by severity, diff stats, review counts, and the
   first 12 chars of the hash.
4. Add `"receipt"` to `WorkbenchTab` and `TABS` between `gate` and `eval`.
   Fetch lazily when the tab is first activated; reset when `card?.id` changes.
5. Empty state: "No receipt yet. One is written when this card's branch merges."

**Tests:**

- `renders_high_confidence_and_reasons`
- `renders_guard_errors_and_warnings`
- `shows_empty_state_without_receipt`

Mock `fetch` the way `InspectorPane.test.tsx` already does.

**Verify:** `cd web && npm test && npm run build`
**Commit:** `feat(web): receipt tab in the inspector`

---

## Phase 10 — Web review queue panel

**Files:** `web/src/components/ReviewQueuePanel.tsx`,
`web/src/components/BoardView.tsx`, `web/src/lib/api.ts`,
`web/src/lib/types.ts`

- `fetchReviewQueue(): Promise<{ items: QueueItem[] }>`.
- `ReviewQueuePanel`: table of tier, score, card, branch, files/lines, top
  reason. Clicking a row calls the existing card-selection callback.
- Add a `Review queue` button to the BoardView header next to the view toggles.
  Open as a right-side sheet or modal consistent with existing panels.
- Badge the button with the count of `Must` items.

**Tests:**

- `renders_items_sorted_by_tier`
- `shows_empty_state`
- `button_badges_must_count`

**Verify:** `cd web && npm test && npm run build`
**Commit:** `feat(web): risk-ranked review queue panel`

---

## Phase 11 — Docs and final verification

**Files:** `README.md`, `docs/content/COMMANDS.md`,
`docs/content/MCP_AGENTS.md`, `docs/content/API_REFERENCE.md`,
`specs/README.md`, `specs/SPEC-007-trust-layer.md`

- README: add a "Trust layer" section with the three commands and the tagline.
- `docs/content/COMMANDS.md`: full flags and exit codes.
- `docs/content/MCP_AGENTS.md`: the five tools and when an agent should call them.
- `docs/content/API_REFERENCE.md`: the five routes and their payloads.
- `specs/README.md`: add SPEC-006 and SPEC-007 rows; mark 007 `proposed` until
  the final verification passes, then `implemented`.
- Spec: tick acceptance criteria.

Final gate:

```bash
cargo test --workspace --quiet
cargo clippy --workspace --all-targets --quiet -- -D warnings
cd web && npm test
cd web && npm run build
```

Manual smoke (from a scratch repo):

```bash
barkcli init
barkcli guard --range HEAD~1..HEAD
barkcli receipt create --card <id>
barkcli receipt show <card>
barkcli receipt verify <card>
barkcli review queue
```

**Commit:** `docs: trust layer`

---

## Interface contracts (keep these stable)

- `GuardReport.findings` is always sorted by severity desc, path, line.
- `Receipt.content_hash` covers every field except itself.
- `Confidence.level` is the minimum of all fired rules.
- `RiskAssessment.score` is the sum of signal points, capped at 100.
- Every CLI `--json` flag prints exactly one JSON value to stdout, nothing else.
- Guard never prints a secret value; receipts never store one.

## Out of scope (do not drift into these)

- Blocking merges by default.
- Committing receipts to the repo.
- Scanning git history for secrets.
- LLM-based review or scoring.
- PR integration (GitHub/GitLab APIs).
- A hosted receipt service.
