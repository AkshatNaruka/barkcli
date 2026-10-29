#!/usr/bin/env bash
# End-to-end smoke test for the packaged macOS app.
#
# Runs the app in headless --smoke mode with a Finder-like PATH, then checks
# that the Trust Layer and AI surfaces are actually reachable.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${1:-$ROOT/desktop/target/release/bundle/macos/Bark.app}"
DESKTOP="$APP/Contents/MacOS/barkcli-desktop"
SIDECAR="$APP/Contents/MacOS/barkcli"
SMOKE_SECS="${BARKCLI_SMOKE_SECS:-20}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bark-smoke.XXXXXX")"
APP_PID=""

dump_logs() {
  echo "--- app stderr ---" >&2
  tail -30 "$TMP/app.err" 2>/dev/null >&2 || true
  echo "--- server log ---" >&2
  tail -30 "$HOME/Library/Logs/barkcli/server.log" 2>/dev/null >&2 || true
}

cleanup() {
  local status=$?
  if [[ -n "${APP_PID:-}" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [[ -f "$TMP/.board/server.json" ]]; then
    local pid
    pid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pid", ""))' "$TMP/.board/server.json" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  fi
  rm -rf "$TMP"
  exit "$status"
}
trap cleanup EXIT INT TERM

ok() { printf '  ok  %s\n' "$*"; }
die() { echo "FAIL  $*" >&2; dump_logs; exit 1; }

[[ -x "$DESKTOP" ]] || die "missing $DESKTOP (run desktop/scripts/build-macos-app.sh)"
[[ -x "$SIDECAR" ]] || die "missing $SIDECAR"

echo "smoke: $APP"

cd "$TMP"
git init -q
git config user.email "smoke@barkcli.test"
git config user.name "Bark Smoke"
"$SIDECAR" init >/dev/null
"$SIDECAR" tasks add "Smoke card" --column review >/dev/null
ok "temp project initialized"

# A Finder launch inherits a minimal PATH. Force the same condition so the
# provider check proves the shell's PATH augmentation, not this terminal.
BARKCLI_PROJECT="$TMP" PATH="/usr/bin:/bin" BARKCLI_SMOKE_SECS="$SMOKE_SECS" \
  "$DESKTOP" --smoke >"$TMP/app.out" 2>"$TMP/app.err" &
APP_PID=$!

for _ in $(seq 1 100); do
  if grep -q '"status":"ready"' "$TMP/app.out" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    die "app exited before the server was ready"
  fi
  sleep 0.2
done

if ! grep -q '"status":"ready"' "$TMP/app.out" 2>/dev/null; then
  die "server did not become ready in 20s"
fi

read -r PORT TOKEN < <(
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["port"], d["token"])' "$TMP/app.out"
)
[[ -n "${PORT:-}" && -n "${TOKEN:-}" ]] || die "could not parse the smoke handshake"

BASE="http://127.0.0.1:$PORT"
get() { curl -fsS --max-time 10 "$BASE$1?token=$TOKEN"; }
code() { curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "$BASE$1?token=$TOKEN"; }
check_200() {
  local path="$1" status
  status="$(code "$path")"
  [[ "$status" == "200" ]] || die "GET $path -> $status"
  ok "GET $path"
}

get /api/ping >/dev/null
ok "GET /api/ping"
check_200 /api/boards
check_200 /api/providers
check_200 /api/threads
check_200 /api/agents
check_200 /api/run/live
check_200 /api/receipts
check_200 /api/review/queue

curl -fsS --max-time 10 -X POST \
  -H 'Content-Type: application/json' \
  -d '{"text":"Smoke thread","backend":"board","kind":"feature"}' \
  "$BASE/api/threads?token=$TOKEN" >"$TMP/thread.json"
python3 - "$TMP/thread.json" <<'PY'
import json
import sys

thread = json.load(open(sys.argv[1]))
assert thread.get("thread_id"), thread
assert thread.get("status") == "created", thread
print(f"  ok  thread created: {thread['thread_id']}")
PY

get /api/providers >"$TMP/providers.json"
python3 - "$TMP/providers.json" <<'PY'
import json
import os
import sys

providers = json.load(open(sys.argv[1]))
matches = [p for p in providers if p.get("id") == "opencode"]
if not matches:
    raise SystemExit("opencode is not registered")
if os.environ.get("BARKCLI_SMOKE_REQUIRE_OPENCODE", "1") == "1":
    if matches[0].get("available") is not True:
        raise SystemExit(f"opencode is registered but unavailable: {matches[0]}")
    print(f"  ok  opencode available: {matches[0].get('version') or 'unknown version'}")
else:
    print("  ok  opencode registered (availability check skipped)")
PY

get /api/boards | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("boards"), d; print("  ok  boards:", ", ".join(d["boards"]))'

curl -fsS --max-time 10 -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "$BASE/api/guard/scan?token=$TOKEN" >"$TMP/guard.json"
python3 - "$TMP/guard.json" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
assert "passed" in report, report
print(f"  ok  guard scan: {len(report.get('findings', []))} finding(s), passed={report['passed']}")
PY

curl -fsS --max-time 10 "$BASE/?token=$TOKEN" >"$TMP/index.html"
grep -q 'assets/index.js' "$TMP/index.html" \
  || die "index.html does not load assets/index.js"
ok "serves the bundled index.html"

curl -fsS --max-time 10 "$BASE/assets/index.js?token=$TOKEN" >"$TMP/index.js"
grep -q 'review/queue' "$TMP/index.js" \
  || die "served JS is missing the trust-layer review queue"
ok "serves the trust-layer UI"

SIDECAR_PID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pid"])' "$TMP/.board/server.json")"
ok "sidecar pid $SIDECAR_PID"

echo "  … waiting for the smoke window to close"
if ! wait "$APP_PID"; then
  APP_PID=""
  die "app exited non-zero"
fi
APP_PID=""
sleep 1

if kill -0 "$SIDECAR_PID" 2>/dev/null; then
  die "sidecar $SIDECAR_PID survived the app"
fi
ok "sidecar stopped with the shell"

echo
echo "smoke: all checks passed"
