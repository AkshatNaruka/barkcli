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

## Bundle a `.app`

Tauri needs the sidecar copied under its target-triple name and the web assets
built:

```bash
cargo build --release -p barkcli
desktop/scripts/prepare-sidecar.sh release
cd desktop
cargo tauri build          # requires: cargo install tauri-cli --version "^2"
```

Output lands in `desktop/target/release/bundle/macos/`. The bundle contains:

- `Contents/MacOS/barkcli` — the sidecar next to the app binary
- `Contents/Resources/web/dist/` — the same UI the server serves

`barkcli serve --app` refuses to start when another live server is recorded
(exit code 3), so two windows can never split the board state. The server
removes its PID/port files on exit and exits within a second when the parent
dies, even on a force-quit.

## Layout

```
desktop/
├── src/main.rs          # project resolution, sidecar lifecycle, window
├── tauri.conf.json      # bundle + resources + external binary
├── scripts/prepare-sidecar.sh
└── icons/
```
