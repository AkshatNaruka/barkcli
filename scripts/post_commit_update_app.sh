#!/usr/bin/env bash
set -euo pipefail

# Auto-update the macOS Bark.app if commit modifies app-related files.
# Can be bypassed with: BARK_NO_AUTO_UPDATE=1 git commit ...

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Only run on macOS
if [[ "$(uname)" != "Darwin" ]]; then
  exit 0
fi

if [[ "${BARK_NO_AUTO_UPDATE:-0}" == "1" || "${SKIP_APP_UPDATE:-0}" == "1" ]]; then
  echo "==> [post-commit] BARK_NO_AUTO_UPDATE set, skipping Mac app auto-update."
  exit 0
fi

# Detect changed files in the latest commit
if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  CHANGED_FILES=$(git diff-tree -r --no-commit-id --name-only HEAD HEAD~1 2>/dev/null || true)
else
  # First commit on branch
  CHANGED_FILES=$(git diff-tree -r --no-commit-id --name-only HEAD 2>/dev/null || true)
fi

# Check if any app files changed
APP_PATTERN='^(web/|desktop/|barkcli-core/|barkcli-cli/|barkcli-server/)'
if echo "$CHANGED_FILES" | grep -qE "$APP_PATTERN"; then
  echo "==> [post-commit] App changes detected in commit. Auto-updating /Applications/Bark.app..."
  bash "$REPO_ROOT/scripts/deploy_mac_app.sh"
else
  echo "==> [post-commit] No desktop/web app changes in commit; skipping Mac app rebuild."
fi
