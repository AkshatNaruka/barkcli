# Bark desktop

A thin Tauri v2 shell around the **same UI the browser gets**. It finds the
project, starts `barkcli serve --app` on a private loopback port with a
generated token, and opens that URL in a native window. There is no second
frontend and no feature fork: every change to `web/` reaches both shells.

## Run in development

```bash
# 1. Build the CLI (from the repo root)
cargo build -p barkcli

# 2. Start the shell
cd desktop
cargo run
```

The shell prefers the workspace build at `target/debug/barkcli` while
`debug_assertions` are enabled, so a rebuilt server is picked up without
re-copying the sidecar.

Project resolution order:

1. `BARKCLI_PROJECT` or `--project <dir>`
2. the last project opened (saved under Application Support)
3. the nearest parent of the cwd with `.board/` or `.git/`
4. a native folder picker

## Build the `.app` (recommended)

```bash
bash desktop/scripts/build-macos-app.sh
```

The script builds, in order: the release `barkcli` binary, `web/dist`, the
sidecar staging copy, the Tauri bundle, and an ad-hoc signature. It then runs
the freshness verifier. It uses `cargo tauri` when installed and falls back to
`npx --yes @tauri-apps/cli@2` (no project dependency is added).

Output:

```text
desktop/target/release/bundle/macos/Bark.app
```

The bundle contains:

- `Contents/MacOS/barkcli` — the sidecar next to the app binary
- `Contents/Resources/web/dist/` — the same UI the server serves

### Freshness is enforced

```bash
bash desktop/scripts/verify-app.sh [path/to/Bark.app]
```

The verifier fails the build when:

- the bundled sidecar's `--version` differs from `target/release/barkcli`,
- `Contents/Resources/web/dist/assets/index.js` differs from `web/dist`,
- the Trust Layer markers (`receipts`, `review/queue`) are missing,
- the bundled `barkcli` does not support `receipt` / `guard`,
- `Info.plist` and `tauri.conf.json` versions differ,
- the bundle signature is not valid or not sealed.

It also fails on the old pre-Trust-Layer bundle, so a stale `.app` can never be
mistaken for a current one.

### Why the app and browser cannot diverge

- **One UI.** The shell passes `BARKCLI_WEB_DIST` to the sidecar:
  `Contents/Resources/web/dist` in a release bundle, the repo's `web/dist` in
  debug. A project's own `web/dist` cannot override the UI of the app you
  launched.
- **AI from Finder.** GUI launches get launchd's minimal `PATH`, which usually
  misses `~/.opencode/bin`, `~/.local/bin`, and Homebrew. The shell prepends
  those directories before spawning the sidecar, so provider detection and
  agent runs work the same as a terminal launch.
- **Diagnostics.** Sidecar stdout/stderr is appended to
  `~/Library/Logs/barkcli/server.log`. Startup failures in a normal launch show
  a native error dialog instead of disappearing into a missing terminal.

### Smoke test

```bash
bash desktop/scripts/smoke-app.sh
```

This runs the packaged `barkcli-desktop --smoke` with `PATH=/usr/bin:/bin`
against a temporary project. It checks the server, boards, AI surfaces
(`providers`, `threads`, `agents`, `run/live`), the Trust Layer (`receipts`,
`review/queue`, `guard scan`), the bundled static assets, and that the sidecar
stops with the shell. No window opens and no project state is touched.

## Signing

The build script ad-hoc signs the bundle:

```bash
codesign --force --deep --sign - Bark.app
```

That is enough for local use and makes `codesign --verify --deep --strict`
pass. Distribution to another Mac still requires a Developer ID certificate and
notarization; do not ship the ad-hoc bundle as a release.

`barkcli serve --app` refuses to start when another live server is recorded
(exit code 3), so two windows can never split the board state. The server
removes its PID/port files on exit and exits within a second when the parent
dies, even on a force-quit.

## Layout

```
desktop/
├── src/main.rs              # project resolution, sidecar lifecycle, window
├── tauri.conf.json          # bundle + resources + external binary
├── scripts/build-macos-app.sh
├── scripts/build-web.sh
├── scripts/prepare-sidecar.sh
├── scripts/verify-app.sh
├── scripts/smoke-app.sh
└── icons/
```

