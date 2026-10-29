# SPEC-008 — macOS app parity: one UI, one server, a verifiable bundle

**Status:** accepted
**Branch:** `fix/mac-app-parity`
**Depends:** SPEC-007 (Trust Layer)
**Plan:** `PLAN-008-mac-parity.md`

## Goal

The macOS app (`Bark.app`, built from `desktop/`) is the **same product** as the
browser: the same seven-surface web UI, the same server, the same Trust Layer
and AI surfaces. Launching the app must give the current build, never a
snapshot from an earlier milestone.

The app is deliberately a shell, not a second frontend:

```
Bark.app ──spawns──▶ barkcli serve --app ──serves──▶ web/dist
   │                        │
   └── native window ───────┘   (same HTML/JS/CSS the browser gets)
```

## Audit (2026-10-29, master `97f6113`)

| Symptom | Evidence |
|---|---|
| Stale server | `Bark.app/Contents/MacOS/barkcli --version` → `95770a8`; workspace release → `95770a8`, master → `97f6113`. Missing every Trust Layer route. |
| Stale UI | bundled `assets/index.js` has no `receipts` / `review/queue`; fresh `web/dist/assets/index.js` has both. |
| AI blind spot | `desktop/src/main.rs` inherits the launch environment. A Finder-launched app gets launchd's PATH (`/usr/bin:/bin:...`), so `which opencode` fails even though it lives in `~/.opencode/bin`. |
| Asset override | `barkcli-server::static_dir` checks `cwd/web/dist` before the bundle. The shell sets cwd to the project, so a project with its own `web/dist` can serve the wrong UI. |
| Fragile build | no single build/verify command; `beforeBuildCommand` path is cwd-dependent; the bundle is linker-signed (`spctl`: "code has no resources but signature indicates they must be present"). |
| Silent failures | a double-clicked app has no terminal; missing project/binary/server errors only go to stderr. |

## Requirements

### R1 — One reproducible build

`desktop/scripts/build-macos-app.sh` builds, in order:

1. `barkcli` release binary,
2. `web/dist`,
3. sidecar staging (`desktop/binaries/barkcli-<triple>`),
4. Tauri `.app`,
5. ad-hoc code signature,
6. `verify-app.sh`.

A user can run it from the repo root or from `desktop/`.

### R2 — Freshness is enforced, not assumed

`desktop/scripts/verify-app.sh [app]` fails when:

- the bundled sidecar's `--version` differs from `target/release/barkcli`,
- the bundled `web/dist/assets/index.js` hash differs from `web/dist`,
- the trust-layer markers (`receipts`, `review/queue`) are absent,
- `receipt` / `guard` subcommands are unknown to the sidecar,
- the bundle is not sealed (`codesign --verify --deep --strict`),
- the Info.plist version differs from `desktop/tauri.conf.json`.

### R3 — The bundle is the source of UI

The shell passes `BARKCLI_WEB_DIST` to the sidecar:

- release: `Contents/Resources/web/dist`,
- debug: `<repo>/web/dist`.

The server already honors this variable. Project-local `web/dist` can no longer
win over the app's own assets.

### R4 — AI integrations work from Finder

Before spawning the sidecar, the shell builds a PATH that prepends common user
bin directories (including `~/.opencode/bin`, `~/.local/bin`, `~/.cargo/bin`,
`~/.bun/bin`, `/opt/homebrew/bin`, `/usr/local/bin`) and then appends the
inherited PATH. `/api/providers` must report `opencode` available when launched
with `PATH=/usr/bin:/bin`.

### R5 — Headless smoke test

The shell accepts `--smoke`:

- resolves the project like a normal launch,
- starts the same sidecar with the same env,
- prints one JSON line `{port, token}`,
- stays alive for `BARKCLI_SMOKE_SECS` (default 30),
- kills the sidecar on exit.

`desktop/scripts/smoke-app.sh` uses it to verify:

- `GET /api/ping`, `/api/boards`, `/api/providers`, `/api/threads`,
  `/api/agents`, `/api/run/live`,
- `GET /api/receipts`, `/api/review/queue` (Trust Layer),
- `POST /api/guard/scan` (Trust Layer),
- `/` serves the bundled `index.html` and the trust-marked `index.js`,
- the sidecar dies with the shell.

### R6 — Failures are visible

Missing project/binary, a conflicting server, and startup timeouts show a native
error dialog in normal launches. The sidecar's stdout/stderr are appended to
`~/Library/Logs/barkcli/server.log` so AI/provider failures can be diagnosed
after the fact. `--smoke` stays headless and prints to stderr.

### R7 — Docs

`desktop/README.md` documents the build script, freshness check, PATH behavior,
smoke test, signing, and the fact that Developer ID notarization is still
required for distribution.

## Non-goals

- Porting the seven-surface shell or Trust Layer UI to the native SwiftUI client
  in `barkcli-ios/`. That package is a separate iOS client, not the same-UI
  macOS shell.
- Developer ID signing / notarization (requires certificates).
- Auto-update.
- Reimplementing the web UI in AppKit/SwiftUI.

## Acceptance criteria

- [ ] `desktop/scripts/build-macos-app.sh` completes and prints the app path.
- [ ] `desktop/scripts/verify-app.sh` passes on the rebuilt app and fails when
      given the old `95770a8` bundle.
- [ ] Bundled sidecar reports the current git revision and supports
      `guard` / `receipt`.
- [ ] Bundled `assets/index.js` is byte-identical to `web/dist/assets/index.js`.
- [ ] A Finder-like launch (`PATH=/usr/bin:/bin`) reports `opencode` available
      at `/api/providers`.
- [ ] `smoke-app.sh` passes: trust routes, AI routes, static assets, sidecar
      shutdown.
- [ ] `codesign --verify --deep --strict Bark.app` passes.
- [ ] `cargo test --workspace`, `cd web && npm test`, `swift test` still pass.
- [ ] No new runtime dependencies in `barkcli-core` or `desktop` (build tooling
      via `npx @tauri-apps/cli` is not a runtime dependency).
