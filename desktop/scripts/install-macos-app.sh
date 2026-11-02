#!/usr/bin/env bash
# Install Bark.app into /Applications (or ~/Applications) and sync the local
# barkcli binary so CLI + desktop app + self-hosted agent runs stay in lockstep.
#
# Usage:
#   bash desktop/scripts/install-macos-app.sh [--build] [--no-open] [--project <dir>]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DO_BUILD=0
DO_OPEN=1
PROJECT_DIR="$ROOT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      DO_BUILD=1
      shift
      ;;
    --no-open)
      DO_OPEN=0
      shift
      ;;
    --project)
      PROJECT_DIR="${2:-$ROOT}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

SRC_APP="$ROOT/desktop/target/release/bundle/macos/Bark.app"
RELEASE_BIN="$ROOT/target/release/barkcli"

if [[ "$DO_BUILD" -eq 1 || ! -d "$SRC_APP" || ! -x "$RELEASE_BIN" ]]; then
  echo "==> Building release barkcli + Bark.app"
  bash "$ROOT/desktop/scripts/build-macos-app.sh"
fi

echo "==> Installing barkcli CLI binary"
for bin_dir in "$HOME/.local/bin" "$HOME/.cargo/bin"; do
  if [[ -d "$bin_dir" ]]; then
    cp -f "$RELEASE_BIN" "$bin_dir/barkcli"
    chmod +x "$bin_dir/barkcli"
    codesign --force --sign - "$bin_dir/barkcli" >/dev/null 2>&1 || true
    echo "  ok  $bin_dir/barkcli ($("$bin_dir/barkcli" --version | head -1))"
  fi
done

DEST_DIR="/Applications"
if [[ ! -w "$DEST_DIR" ]]; then
  DEST_DIR="$HOME/Applications"
  mkdir -p "$DEST_DIR"
fi
DEST_APP="$DEST_DIR/Bark.app"

echo "==> Stopping any running Bark.app or stale project daemon"
osascript -e 'tell application "Bark" to quit' >/dev/null 2>&1 || true
pkill -f "$DEST_APP/Contents/MacOS/barkcli-desktop" >/dev/null 2>&1 || true
if [[ -x "$RELEASE_BIN" ]]; then
  (cd "$PROJECT_DIR" && "$RELEASE_BIN" serve --stop >/dev/null 2>&1) || true
fi
# Clean up any leftover background daemon holding .board/server.pid in PROJECT_DIR
if [[ -f "$PROJECT_DIR/.board/server.pid" ]]; then
  stale_pid="$(cat "$PROJECT_DIR/.board/server.pid" 2>/dev/null || true)"
  if [[ -n "$stale_pid" ]] && kill -0 "$stale_pid" 2>/dev/null; then
    kill "$stale_pid" 2>/dev/null || true
  fi
  rm -f "$PROJECT_DIR/.board/server.pid" "$PROJECT_DIR/.board/server.json"
fi

echo "==> Installing $DEST_APP"
rm -rf "$DEST_APP"
ditto "$SRC_APP" "$DEST_APP"
xattr -cr "$DEST_APP" 2>/dev/null || true
codesign --force --deep --sign - "$DEST_APP"

echo "==> Verifying installed bundle"
bash "$ROOT/desktop/scripts/verify-app.sh" "$DEST_APP"

echo "==> Pre-configuring default project ($PROJECT_DIR)"
STATE_FILE="$HOME/Library/Application Support/barkcli/app.json"
mkdir -p "$(dirname "$STATE_FILE")"
python3 - "$STATE_FILE" "$PROJECT_DIR" <<'PY'
import json, os, sys
state_file, project_dir = sys.argv[1], os.path.abspath(sys.argv[2])
name = os.path.basename(project_dir) or "project"
data = {}
if os.path.exists(state_file):
    try:
        with open(state_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {}
data["project"] = project_dir
recent = [r for r in data.get("recent", []) if isinstance(r, dict) and r.get("path") != project_dir]
recent.insert(0, {"path": project_dir, "name": name})
data["recent"] = recent[:8]
with open(state_file, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
print(f"  ok  state -> {state_file} (project={project_dir})")
PY

if [[ "$DO_OPEN" -eq 1 ]]; then
  echo "==> Launching $DEST_APP"
  open -a "$DEST_APP" --args --project "$PROJECT_DIR"
  echo "  ok  Bark.app launched on $PROJECT_DIR"
fi
