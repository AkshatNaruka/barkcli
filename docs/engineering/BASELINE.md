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
| Web deps (A1 extension) | `cd web && npm ci` | **PASS** | added 400 packages, 0 vulnerabilities (install-script warnings for esbuild/fsevents). |
| Web unit tests (A1 extension) | `cd web && npm test -- --run` | **FAIL (product baseline)** | **2 failed \| 49 passed files (51); 228 passed \| 2 failed tests (230)**, duration 11.30s. Full-run failures included a SurfacesPanel-related case and `src/threads/ThreadPane.test.tsx:261` (`expect(screen.getByText("private diagnostic", { selector: "summary"…))` not found). Targeted rerun (`vitest run src/shell/SurfacesPanel.test.tsx src/threads/ThreadPane.test.tsx`) => **1 failed \| 1 passed files, 1 failed \| 19 passed tests** (ThreadPane still failing; SurfacesPanel passed in isolation) — investigate flakiness/order dependence + UI contract drift. |
| Web build (A1 extension) | `cd web && npm run build` | **PASS** | `✓ built in 3.37s` (chunk size warnings: large `OperationsView`/`index` bundles; not a build failure). |
| Workspace-wide Rust (`--workspace`), TUI/server/CLI crates, desktop smoke, clippy `--workspace` | — | **NOT RUN** | Time/scope limited. Required for full Phase A truth (A2+ / CI matrix). |

## Skipped vs failed (explicit)
- **Failed:** `cargo fmt --all --check`; `cargo clippy -p barkcli-core --lib -- -D warnings`; web `npm test -- --run` (**2 test failures in full baseline run**; see details).
- **Passed:** `cargo test -p barkcli-core --lib` (419/419), targeted `product_plan` test (1/1), `web npm ci`, `web npm run build`.
- **Skipped / environment-blocked (not product pass/fail):** none after `npm ci` for web baseline in this worktree.
- **Not run:** full `cargo test --workspace`/`cargo clippy --workspace`, TUI/server/CLI crate-specific matrices beyond core lib, desktop smoke, CI OS matrix.

## Known issues / follow-ups (A1/A1-ext findings)
1. **Formatting drift** in `barkcli-tui/src/ui.rs` fails `cargo fmt --check` (pre-existing). Fix as small hygiene PR.
2. **Clippy debt**: `barkcli-core --lib` fails with `-D warnings` (153 errors). Incremental cleanup.
3. **Compiler warnings** (27) in core test build.
4. **`product_plan` test**: reported pre-existing failure earlier; passes here. Re-run on canonical CI/main; add determinism if flaky.
5. **Web test regressions/flakes (baseline):** full run had 2 failures (51 files). `ThreadPane.test.tsx` expects a `summary` containing `"private diagnostic"` (line ~261) — UI/test contract drift; SurfacesPanel failure appeared in full run but passed in targeted rerun (possible order/flakiness). Fix tests or restore intended accessible labels/behavior with product intent.
6. **Web bundle size warnings** from Vite build (`OperationsView`/`index` > 500kB gzip thresholds warned) — performance follow-up, not build break.
7. **Test stderr noise** (`fatal: Unable to read current working directory...`) during core tests — investigate.

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
- [x] Supported checks run where feasible; **pass/fail/skip separated**.
- [x] Known issues triaged with evidence (including web baseline after deps).
- [~] Full `--workspace` Rust + CI OS matrix still not run (time/cost). A1 core + web baseline complete enough to proceed to **A2**; carry remaining matrix into A2/CI setup.
