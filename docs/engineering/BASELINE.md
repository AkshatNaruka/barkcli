# Baseline (A1) — BarkCLI

**Date:** 2026-11-07  
**Scope:** Phase A / A1 (toolchain truth + supported non-destructive checks). Not a behavior/performance/security certification.  
**Worktree:** `/Users/akshatnaruka/Downloads/.ses/barkcli/.board/worktrees/upgrade-a1-baseline`  
**Branch:** `plan/upgrade-a1-baseline`  
**HEAD:** `80afdb5a8c22cef91dad345249598f6fc82ac663` (`feat: major upgrade - event sourcing, plugins, providers, threads UX, worktree fix`)  
**Worktree dirty at capture:** 1 uncommitted file (`tasks/upgrade-master-plan-2026-11-07.md`, plan doc added for this task). Source under test otherwise matches HEAD.  
**Main checkout context:** `master...origin/master [ahead 5]`, untracked `audit/` present there (not in this worktree).

## Toolchain
| Tool | Version |
|---|---|
| rustc | 1.97.1 (8bab26f4f 2026-07-14) |
| cargo | 1.97.1 (c980f4866 2026-06-30) |
| node | v26.13.0 |
| npm | 11.20.0 |

## Commands and results (exact status)

| Area | Command (worktree root unless noted) | Result | Notes |
|---|---|---|---|
| Rust format | `cargo fmt --all --check` | **FAIL (exit 1)** | Formatting drift reported in `barkcli-tui/src/ui.rs` (diff shown by cargo fmt). Pre-existing at baseline; not fixed in A1 to keep scope minimal. |
| Rust tests (targeted known issue) | `cargo test -p barkcli-core --lib agent::product_plan::tests::from_card_creates_verification_dependency` | **PASS** | `1 passed; 0 failed; 0 ignored; 418 filtered out; finished 0.00s` (exit 0). Prior session note listed this as pre-existing failure; **passes in this worktree/build** — needs confirmation on main/CI environments before treating as resolved. |
| Rust tests (core lib) | `cargo test -p barkcli-core --lib` | **PASS** | `419 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished 4.60s` (exit 0). Build emitted 27 compiler warnings (`unused_imports/mut/unsafe/variables/unreachable_patterns/dead_code` etc.). Non-fatal stderr lines observed during some tests: `fatal: Unable to read current working directory: No such file or directory` (investigate; did not fail reported tests). |
| Rust lint (core lib, warnings as errors) | `cargo clippy -p barkcli-core --lib -- -D warnings` | **FAIL (exit non-zero)** | `could not compile barkcli-core (lib) due to 153 previous errors` (clippy lints treated as errors). Baseline quality gap; representative lints shown include `unnecessary_map_or`, `unnecessary_sort_by` (full output longer). |
| Web scripts | `node -e "console.log(Object.keys(require('./package.json').scripts||{}).join('\n'))"` (in `web/`) | **PASS (info)** | `dev, build, preview, test, test:watch, test:coverage`. |
| Web unit tests | `cd web && npm test -- --run` | **SKIPPED/ENV FAIL** | `sh: vitest: command not found` (exit 127). Fresh worktree has no `web/node_modules` (deps not installed). **Not a product test failure**; requires `npm ci` (or equivalent) in `web/`. |
| Web build | `cd web && npm run build` | **NOT RUN** | Blocked by missing deps in fresh worktree (same environment constraint as tests). Run after `npm ci` for a valid baseline. |
| Workspace-wide Rust (`--workspace`), TUI/server/CLI crates, desktop smoke, clippy `--workspace` | — | **NOT RUN** | Time/scope limited in A1. Required for full Phase A truth (A1 extension/A2+). |

## Skipped vs failed (explicit)
- **Failed:** `cargo fmt --all --check`; `cargo clippy -p barkcli-core --lib -- -D warnings`.
- **Passed:** `cargo test -p barkcli-core --lib` (419/419), targeted `product_plan` test (1/1).
- **Skipped / environment-blocked (not product pass/fail):** web test/build in fresh worktree (missing `node_modules`/vitest); full workspace checks.
- **Not run:** full workspace tests/clippy, other crate targets, desktop packaging smoke.

## Known issues / follow-ups (A1 findings)
1. **Formatting drift** in `barkcli-tui/src/ui.rs` fails `cargo fmt --check` (pre-existing at HEAD). Fix as a small hygiene PR or include with TUI touchpoint — avoid mixing into unrelated feature PRs.
2. **Clippy debt**: `barkcli-core --lib` fails with `-D warnings` (153 errors). Prioritize mechanical fixes + targeted allows only where justified; gate incrementally.
3. **Compiler warnings** (27) in core test build — clean up to improve signal.
4. **`product_plan` test status**: reported pre-existing failure earlier; passes here. Re-run in canonical CI/main environment to confirm; if flaky, add deterministic coverage.
5. **Web baseline in clean checkout** requires `npm ci` then `npm test -- --run` + `npm run build` (and capture results). Do in A1 extension or A2 setup.
6. **Test stderr noise** (`fatal: Unable to read current working directory...`) seen during core tests — investigate CWD handling in tests/subprocesses.

## Repro steps
```bash
git worktree add -b <branch> <path> 80afdb5
cd <path>
rustc -V && cargo -V && node -v && npm -v
cargo fmt --all --check
cargo test -p barkcli-core --lib
cargo test -p barkcli-core --lib agent::product_plan::tests::from_card_creates_verification_dependency
cargo clippy -p barkcli-core --lib -- -D warnings
cd web && npm ci && npm test -- --run && npm run build
```

## A1 acceptance
- [x] Commit/toolchain captured.
- [x] Supported checks run where feasible; **pass/fail/skip separated** (skipped ≠ passed).
- [x] Known issue triaged with evidence.
- [ ] Full workspace + web (after deps) + CI-equivalent matrix — **remaining** (A1 extension / next tasks).
