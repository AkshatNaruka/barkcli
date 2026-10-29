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
  local info="$TMP/.board/server-app.json"
  [[ -f "$info" ]] || info="$TMP/.board/server.json"
  if [[ -f "$info" ]]; then
    local pid
    pid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pid", ""))' "$info" 2>/dev/null || true)"
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

get /api/project >"$TMP/project.json"
python3 - "$TMP/project.json" "$TMP" <<'PY'
import json
import os
import sys

project = json.load(open(sys.argv[1]))
assert os.path.realpath(project["root"]) == os.path.realpath(sys.argv[2]), project
assert project["is_git"] is True, project
assert "setup" in project and "counts" in project, project
assert project["boards"], project
assert any(item["command"] == "git status --short" for item in project["commands"]), project
print(f"  ok  project: {project['name']} ({project['counts']['cards']} cards)")
PY

curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' -d '{"command":"printf bark-smoke && pwd"}' \
  "$BASE/api/exec?token=$TOKEN" >"$TMP/exec.json"
python3 - "$TMP/exec.json" "$TMP" <<'PY'
import json
import os
import sys

result = json.load(open(sys.argv[1]))
assert result["ok"] is True, result
assert result["exit_code"] == 0, result
assert "bark-smoke" in result["stdout"], result
assert os.path.realpath(result["cwd"]) == os.path.realpath(sys.argv[2]), result
print("  ok  command runner")
PY

curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' -d '{"text":"Where is the smoke card?","backend":"opencode","mode":"chat"}' \
  "$BASE/api/threads?token=$TOKEN" >"$TMP/chat-thread.json"
python3 - "$TMP/chat-thread.json" <<'PY'
import json
import sys

thread = json.load(open(sys.argv[1]))
assert thread.get("thread_id"), thread
assert thread.get("status") == "created", thread
print(f"  ok  chat thread created: {thread['thread_id']}")
PY

CHAT_THREAD="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["thread_id"])' "$TMP/chat-thread.json")"
get "/api/threads/$CHAT_THREAD" >"$TMP/chat-thread-detail.json"
python3 - "$TMP/chat-thread-detail.json" <<'PY'
import json
import sys

detail = json.load(open(sys.argv[1]))
events = detail.get("events", [])
assert len(events) == 1, events
assert events[0]["kind"] == "user", events
print("  ok  chat thread has one user event and no auto-plan")
PY

# Contribution graph smoke
curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke hypothesis","kind":"hypothesis","text":"The command runner works"}' \
  "$BASE/api/contributions?token=$TOKEN" >"$TMP/contribution-1.json"
CONTRIBUTION_1="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$TMP/contribution-1.json")"
curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Smoke result\",\"kind\":\"result\",\"parent\":\"$CONTRIBUTION_1\"}" \
  "$BASE/api/contributions?token=$TOKEN" >"$TMP/contribution-2.json"
CONTRIBUTION_2="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$TMP/contribution-2.json")"
get /api/contributions >"$TMP/contributions.json"
python3 - "$TMP/contributions.json" <<'PY'
import json
import sys

analysis = json.load(open(sys.argv[1]))
assert analysis["metrics"]["total_nodes"] >= 2, analysis["metrics"]
assert analysis["metrics"]["edges"] >= 1, analysis["metrics"]
assert len(analysis["nodes"]) >= 2, analysis["nodes"]
print("  ok  contribution graph indexed")
PY
get "/api/runs/$CONTRIBUTION_2/ancestry" >"$TMP/ancestry.json"
python3 - "$TMP/ancestry.json" <<'PY'
import json
import sys

ancestry = json.load(open(sys.argv[1]))
assert len(ancestry["lineage"]) == 2, ancestry["lineage"]
print("  ok  contribution ancestry")
PY

# Automation smoke
curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' \
  -d '{"intent":"summarize the README","every":"1h","backend":"opencode"}' \
  "$BASE/api/schedules?token=$TOKEN" >"$TMP/schedule.json"
SCHEDULE_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$TMP/schedule.json")"
get /api/schedules >"$TMP/schedules.json"
python3 - "$TMP/schedules.json" <<'PY'
import json
import sys

schedules = json.load(open(sys.argv[1]))
assert len(schedules) >= 1, schedules
print("  ok  automation scheduled")
PY
curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "$BASE/api/schedules-run-due?token=$TOKEN" >/dev/null
curl -fsS --max-time 60 -X DELETE \
  "$BASE/api/schedules/$SCHEDULE_ID?token=$TOKEN" >/dev/null

curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "$BASE/api/project/onboard?token=$TOKEN" >"$TMP/onboard.json"
CONTRIBUTION_1="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$TMP/contribution-1.json")"
curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Smoke result\",\"kind\":\"result\",\"parent\":\"$CONTRIBUTION_1\"}" \
  "$BASE/api/contributions?token=$TOKEN" >"$TMP/contribution-2.json"
CONTRIBUTION_2="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$TMP/contribution-2.json")"

get /api/contributions >"$TMP/contributions.json"
python3 - "$TMP/contributions.json" <<'PY'
import json
import sys

analysis = json.load(open(sys.argv[1]))
assert analysis["metrics"]["total_nodes"] >= 2, analysis["metrics"]
assert analysis["metrics"]["edges"] >= 1, analysis["metrics"]
assert len(analysis["nodes"]) >= 2, analysis["nodes"]
print("  ok  contribution graph indexed")
PY

get "/api/runs/$CONTRIBUTION_2/ancestry" >"$TMP/ancestry.json"
python3 - "$TMP/ancestry.json" <<'PY'
import json
import sys

ancestry = json.load(open(sys.argv[1]))
assert len(ancestry["lineage"]) == 2, ancestry["lineage"]
print("  ok  contribution ancestry")
PY

curl -fsS --max-time 60 -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "$BASE/api/project/onboard?token=$TOKEN" >"$TMP/onboard.json"
python3 - "$TMP/onboard.json" <<'PY'
import json
import sys

result = json.load(open(sys.argv[1]))
assert result.get("ok") is True, result
ids = {step["id"] for step in result.get("steps", [])}
for required in ("board", "context", "team", "hooks", "providers"):
    assert required in ids, (required, ids)
assert result["project"]["setup"]["complete"] is True, result["project"]["setup"]
print("  ok  project onboarding: " + ", ".join(sorted(ids)))
PY

get /api/hooks >"$TMP/hooks.json"
python3 - "$TMP/hooks.json" <<'PY'
import json
import sys

hooks = json.load(open(sys.argv[1]))
assert hooks.get("opencode") is True, hooks
assert hooks.get("claude_code") is True, hooks
print("  ok  agent hooks installed")
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

SIDECAR_INFO="$TMP/.board/server-app.json"
[[ -f "$SIDECAR_INFO" ]] || SIDECAR_INFO="$TMP/.board/server.json"
SIDECAR_PID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pid"])' "$SIDECAR_INFO")"
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
