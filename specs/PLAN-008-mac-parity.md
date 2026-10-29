# PLAN-008 — macOS app parity implementation plan

> Work phase by phase. Each phase ends with a verification command and a
> commit. Do not rebuild the bundle until the shell changes compile.

**Spec:** `specs/SPEC-008-mac-parity.md`
**Branch:** `fix/mac-app-parity`
**Estimated size:** ~500 LOC (shell + scripts + docs), no Rust core changes.

## Phase 0 — Audit baseline

Record the stale bundle and keep it for the negative verification test:

```bash
cp -R desktop/target/release/bundle/macos/Bark.app /tmp/Bark-stale.app
desktop/target/release/bundle/macos/Bark.app/Contents/MacOS/barkcli --version
# 95770a8, while master is 97f6113
desktop/scripts/verify-app.sh /tmp/Bark-stale.app   # must fail after Phase 3
```

Commit: `docs(spec): plan macOS parity and bundle freshness`

## Phase 1 — Build pipeline

**New**

- `desktop/scripts/build-macos-app.sh` — release CLI → web → sidecar → Tauri →
  ad-hoc sign → verify.
- `desktop/scripts/build-web.sh` — path-independent web build for
  `beforeBuildCommand`.
- `desktop/scripts/verify-app.sh` — freshness, trust markers, signature,
  version.

**Modified**

- `desktop/tauri.conf.json` — `beforeBuildCommand` uses the path-independent
  script; product version `0.4.0`.
- `desktop/Cargo.toml` — version `0.4.0`.

The build script uses `cargo tauri` when installed, otherwise
`npx --yes @tauri-apps/cli@2`. It never edits `Cargo.lock`.

Verify:

```bash
bash desktop/scripts/build-macos-app.sh
```

Commit: `build(desktop): reproducible, freshness-checked macOS bundle`

## Phase 2 — Shell parity fixes

**Modified:** `desktop/src/main.rs`

1. `bundled_web_dist()` → release `Contents/Resources/web/dist`, debug
   `<repo>/web/dist`; pass `BARKCLI_WEB_DIST` to the sidecar.
2. `augmented_path()` → prepend `~/.opencode/bin`, `~/.local/bin`,
   `~/.cargo/bin`, `~/.bun/bin`, `~/.volta/bin`, `~/Library/pnpm`,
   `/opt/homebrew/bin`, `/usr/local/bin`, then inherited PATH. Deduplicate.
3. `--smoke` headless mode: start the same server, print `{port, token}`,
   keep the parent alive for `BARKCLI_SMOKE_SECS`, then stop.
4. Native error dialogs for missing project/binary and startup failures
   (normal launches only).
5. Append sidecar stdout/stderr to
   `~/Library/Logs/barkcli/server.log`.

Unit tests (pure functions):

- `augmented_path` contains the user bin dirs and preserves the existing PATH.
- `bundled_web_dist` is `None` outside a bundle in debug when the repo build is
  absent (guard with a path argument so it is testable).

Verify:

```bash
cd desktop && cargo test
cd .. && cargo build --release -p barkcli
```

Commit: `fix(desktop): bundle assets, Finder PATH, and smoke mode`

## Phase 3 — End-to-end verification

**New:** `desktop/scripts/smoke-app.sh`

```bash
# temp project + app --smoke + curl assertions
```

Checks:

- `/api/ping` (server alive)
- `/api/boards` (project wiring)
- `/api/providers` contains an available `opencode` (AI PATH)
- `/api/threads`, `/api/agents`, `/api/run/live` (AI surfaces)
- `/api/receipts`, `/api/review/queue` (Trust Layer)
- `POST /api/guard/scan` returns a report
- `/` contains the trust-marked `assets/index.js`
- app exits → sidecar PID is gone

`verify-app.sh` also runs against `/tmp/Bark-stale.app` and must exit non-zero.

Commit: `test(desktop): prove bundle parity and AI provider visibility`

## Phase 4 — Rebuild, docs, release gate

1. `bash desktop/scripts/build-macos-app.sh`
2. `bash desktop/scripts/smoke-app.sh`
3. Update `desktop/README.md`:
   - one-command build,
   - freshness check,
   - Finder PATH behavior,
   - `--smoke`,
   - signing/notarization status,
   - project asset override behavior.
4. Update `specs/README.md` with SPEC-008.
5. Run the full gate:

```bash
cargo test --workspace
cd web && npm test && npm run build
cd ../barkcli-ios && swift test
```

6. Launch the rebuilt `Bark.app` once against the repo and confirm the seven
   surfaces + Receipt tab load (manual visual check; automated by smoke).

Commit: `docs(desktop): document the parity build and smoke test`

## Risks

- **Tauri CLI availability.** `cargo tauri` is not installed on this machine;
  the script falls back to `npx @tauri-apps/cli@2`. Pin the major version.
- **Ad-hoc signing.** `codesign --force --deep --sign -` seals the bundle but
  does not satisfy Gatekeeper for downloaded copies. Distribution still needs a
  Developer ID + notarization; out of scope.
- **PATH probing.** Prepending common directories covers this machine and most
  developer setups; if a provider still isn't found, `BARKCLI_AGENT_CMD` remains
  the escape hatch.
- **Project-local `web/dist`.** `BARKCLI_WEB_DIST` now always wins, which is
  what a shipped app needs. Developers who want to preview a project-local UI
  can still run `barkcli serve` from the terminal.
