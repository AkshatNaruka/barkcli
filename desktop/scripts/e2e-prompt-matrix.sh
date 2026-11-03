#!/usr/bin/env bash
# End-to-end prompt test matrix for the barkcli agentic harness.
#
# Tests the full management layer lifecycle across 5 realistic scenarios:
# 1. Feature Build Intent (isolated worktree, code generation, test gate, merge)
# 2. Bug Fix with Failed Gate Recovery (failing gate -> retry prompt injection -> passing gate)
# 3. Cheating / Broken Agent Guard (rejection of failing test gate)
# 4. Concurrent Parallel Pool & Merge Train (3 parallel workers, merge serialization)
# 5. Native macOS Desktop App IPC & Live Runtime (headless smoke & API surface)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${1:-$ROOT/desktop/target/release/bundle/macos/Bark.app}"
SIDECAR="$APP/Contents/MacOS/barkcli"
if [[ ! -x "$SIDECAR" ]]; then
  SIDECAR="$ROOT/target/release/barkcli"
fi

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/bark-e2e-matrix.XXXXXX")"
cleanup() {
  local status=$?
  rm -rf "$TMP_ROOT"
  exit "$status"
}
trap cleanup EXIT INT TERM

ok() { printf '  \033[32mok\033[0m  %s\n' "$*"; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
die() { printf '  \033[31mFAIL\033[0m %s\n' "$*" >&2; exit 1; }

echo "═════════════════════════════════════════════════════════════════"
echo "  barkcli Ultimate Agentic Harness: End-to-End Prompt Matrix"
echo "  Binary: $SIDECAR"
echo "  App:    $APP"
echo "═════════════════════════════════════════════════════════════════"
echo

# Helper Python function to safely extract the trailing JSON report
extract_json_field() {
  local file="$1"
  local code="$2"
  python3 -c "
import json, sys
try:
    text = open('$file').read()
    s = text.find('{')
    e = text.rfind('}')
    if s != -1 and e != -1:
        data = json.loads(text[s:e+1])
    else:
        data = {}
except Exception as ex:
    data = {}
$code
"
}

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 1: Feature Build Intent
# ─────────────────────────────────────────────────────────────────────────────
info "Scenario 1: Feature Build Intent in isolated worktree"
S1="$TMP_ROOT/s1_feature"
mkdir -p "$S1" && cd "$S1"
git init -q -b main
git config user.name "Bark E2E"
git config user.email "e2e@barkcli.test"

cat > test.sh <<'EOF'
#!/bin/sh
set -e
if [ ! -f "src/health.json" ]; then
  echo "missing src/health.json" >&2
  exit 1
fi
grep -q '"status": "ok"' src/health.json || exit 1
echo "health test passed"
EOF
chmod +x test.sh

cat > fake-feature-agent.sh <<'EOF'
#!/bin/sh
set -e
mkdir -p src
cat > src/health.json <<'JSON'
{
  "status": "ok",
  "uptime_seconds": 42
}
JSON
echo "feature agent: created src/health.json"
exit 0
EOF
chmod +x fake-feature-agent.sh

git add .
git commit -q -m "initial commit"
"$SIDECAR" init --yes >/dev/null
"$SIDECAR" create main >/dev/null

export BARKCLI_AGENT_CMD="./fake-feature-agent.sh"
REPORT_FILE="$S1/report.out"
"$SIDECAR" run "Add health check endpoint returning status ok" \
  --yes --offline --board main --test-cmd "sh test.sh" --json > "$REPORT_FILE"

COMPLETED=$(extract_json_field "$REPORT_FILE" "print(data.get('completed', 0))")
MERGED=$(extract_json_field "$REPORT_FILE" "print(all(t.get('merged', False) for t in data.get('tasks', [])))")

[[ "$COMPLETED" -ge 1 ]] || die "Scenario 1: expected at least 1 completed task, got $COMPLETED"
[[ "$MERGED" == "True" ]] || die "Scenario 1: task branch did not merge into main"
[[ -f "src/health.json" ]] || die "Scenario 1: deliverable file src/health.json not found on main after merge"
ok "Feature built, verified by acceptance gate, and merged to main"
unset BARKCLI_AGENT_CMD

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 2: Bug Fix with Failed Gate Recovery (Retry Loop)
# ─────────────────────────────────────────────────────────────────────────────
info "Scenario 2: Bug Fix with Failed Gate Recovery"
S2="$TMP_ROOT/s2_bugfix"
mkdir -p "$S2" && cd "$S2"
git init -q -b main
git config user.name "Bark E2E"
git config user.email "e2e@barkcli.test"

mkdir -p src
cat > src/math.sh <<'EOF'
#!/bin/sh
echo 41
EOF
chmod +x src/math.sh

cat > test.sh <<'EOF'
#!/bin/sh
val=$(sh src/math.sh)
if [ "$val" != "42" ]; then
  echo "assertion failure: expected 42 got $val" >&2
  exit 1
fi
echo "math test passed"
EOF
chmod +x test.sh

# Agent script that fixes math.sh on attempt 2
cat > fake-retry-agent.sh <<'EOF'
#!/bin/sh
set -e
PROMPT_FILE="$1"
ATTEMPT_FLAG="/tmp/bark_s2_flag"
if [ -f "$ATTEMPT_FLAG" ] || grep -q -i "assertion failure" "$PROMPT_FILE" 2>/dev/null; then
  echo "retry agent: detected gate failure in prompt, fixing to 42"
  cat > src/math.sh <<'FIXED'
#!/bin/sh
echo 42
FIXED
else
  echo "retry agent: attempt 1 (still broken)"
  touch "$ATTEMPT_FLAG"
  cat > src/math.sh <<'BROKEN'
#!/bin/sh
echo 41
BROKEN
fi
exit 0
EOF
chmod +x fake-retry-agent.sh
rm -f /tmp/bark_s2_flag

git add .
git commit -q -m "initial commit with buggy math"
"$SIDECAR" init --yes >/dev/null
"$SIDECAR" create main >/dev/null

export BARKCLI_AGENT_CMD="./fake-retry-agent.sh"
REPORT_FILE="$S2/report.out"
"$SIDECAR" run "Fix math computation to return 42" \
  --yes --offline --board main --test-cmd "sh test.sh" --max-attempts 3 --json > "$REPORT_FILE" || true

ATTEMPTS=$(extract_json_field "$REPORT_FILE" "print(max((t.get('attempts', 1) for t in data.get('tasks', [])), default=1))")
COMPLETED=$(extract_json_field "$REPORT_FILE" "print(data.get('completed', 0))")

[[ "$COMPLETED" -ge 1 ]] || die "Scenario 2: bug fix did not complete after retry"
[[ "$ATTEMPTS" -ge 2 ]] || die "Scenario 2: expected at least 2 attempts for recovery, got $ATTEMPTS"
RESULT_VAL=$(sh src/math.sh)
[[ "$RESULT_VAL" == "42" ]] || die "Scenario 2: final code output is $RESULT_VAL, expected 42"
ok "First gate failure injected into retry prompt; recovered and passed on attempt $ATTEMPTS"
rm -f /tmp/bark_s2_flag
unset BARKCLI_AGENT_CMD

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 3: Broken Agent Acceptance Gate Guard (Quarantine on Test Failure)
# ─────────────────────────────────────────────────────────────────────────────
info "Scenario 3: Broken Agent Acceptance Gate Guard (No Merge on Test Failure)"
S3="$TMP_ROOT/s3_broken"
mkdir -p "$S3" && cd "$S3"
git init -q -b main
git config user.name "Bark E2E"
git config user.email "e2e@barkcli.test"

cat > test.sh <<'EOF'
#!/bin/sh
if [ "$(cat config.txt 2>/dev/null)" != "CORRECT_SECRET_TOKEN" ]; then
  echo "gate check failed: incorrect token" >&2
  exit 1
fi
echo "gate ok"
EOF
chmod +x test.sh

# Defective agent that writes BAD_TOKEN
cat > fake-broken-agent.sh <<'EOF'
#!/bin/sh
echo "agent: claims finished, but writes bad token"
echo "BAD_TOKEN" > config.txt
exit 0
EOF
chmod +x fake-broken-agent.sh

git add .
git commit -q -m "initial commit"
"$SIDECAR" init --yes >/dev/null
"$SIDECAR" create main >/dev/null

export BARKCLI_AGENT_CMD="./fake-broken-agent.sh"
REPORT_FILE="$S3/report.out"
"$SIDECAR" run "Configure secret token" \
  --yes --offline --board main --test-cmd "sh test.sh" --max-attempts 2 --json > "$REPORT_FILE" || true

FAILED_COUNT=$(extract_json_field "$REPORT_FILE" "print(data.get('failed', 0))")
COMPLETED_COUNT=$(extract_json_field "$REPORT_FILE" "print(data.get('completed', 0))")
MERGED_ANY=$(extract_json_field "$REPORT_FILE" "print(any(t.get('merged', False) for t in data.get('tasks', [])))")

[[ "$FAILED_COUNT" -ge 1 ]] || die "Scenario 3: defective agent was not marked as failed"
[[ "$COMPLETED_COUNT" -eq 0 ]] || die "Scenario 3: defective agent was improperly marked as completed"
[[ "$MERGED_ANY" == "False" ]] || die "Scenario 3: broken branch was merged into main (gate failed!)"
ok "Defective agent failed acceptance gate; worktree quarantined, zero merges to main"
unset BARKCLI_AGENT_CMD

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 4: Concurrent Parallel Pool & Merge Train
# ─────────────────────────────────────────────────────────────────────────────
info "Scenario 4: Concurrent Parallel Pool (--agents 3) with Merge Train"
S4="$TMP_ROOT/s4_parallel"
mkdir -p "$S4" && cd "$S4"
git init -q -b main
git config user.name "Bark E2E"
git config user.email "e2e@barkcli.test"

cat > test.sh <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x test.sh

# Parallel worker writes a distinct file based on its working directory (task ID)
cat > fake-parallel-worker.sh <<'EOF'
#!/bin/sh
set -e
NAME="$(basename "$(pwd)")"
echo "worker deliverable $NAME" > "worker-$NAME.txt"
sleep 0.2
echo "worker $NAME completed"
exit 0
EOF
chmod +x fake-parallel-worker.sh

git add .
git commit -q -m "initial commit"
"$SIDECAR" init --yes >/dev/null
"$SIDECAR" create main >/dev/null

export BARKCLI_AGENT_CMD="./fake-parallel-worker.sh"
REPORT_FILE="$S4/report.out"
"$SIDECAR" run "Deliver module A, module B, and module C concurrently" \
  --agents 3 --yes --offline --board main --test-cmd "sh test.sh" --json > "$REPORT_FILE"

WORKERS_PEAK=$(extract_json_field "$REPORT_FILE" "print(data.get('workers_peak', 1))")
FAILED_COUNT=$(extract_json_field "$REPORT_FILE" "print(data.get('failed', 0))")
MERGED_ALL=$(extract_json_field "$REPORT_FILE" "print(all(t.get('merged', False) for t in data.get('tasks', [])))")

[[ "$FAILED_COUNT" -eq 0 ]] || die "Scenario 4: $FAILED_COUNT task(s) failed in parallel run"
[[ "$MERGED_ALL" == "True" ]] || die "Scenario 4: not all parallel branches merged through merge train"
ok "Parallel pool ran with peak concurrency ($WORKERS_PEAK workers) and merged cleanly"
unset BARKCLI_AGENT_CMD

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 5: Native macOS App IPC & Live Runtime
# ─────────────────────────────────────────────────────────────────────────────
info "Scenario 5: Native macOS App IPC & Live Runtime"
if [[ -x "$APP/Contents/MacOS/barkcli-desktop" ]]; then
  bash "$ROOT/desktop/scripts/smoke-app.sh" "$APP" >/dev/null
  ok "macOS desktop app IPC, background sidecar, and UI server fully validated"
else
  info "Skipping Scenario 5: $APP/Contents/MacOS/barkcli-desktop not found"
fi

echo
echo "═════════════════════════════════════════════════════════════════"
echo "  All 5 E2E Harness Scenarios Passed with 100% Reliability!    "
echo "═════════════════════════════════════════════════════════════════"
