#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "No .git directory found at $REPO_ROOT"
  exit 1
fi

POST_COMMIT_HOOK="$HOOKS_DIR/post-commit"

cat << 'EOF' > "$POST_COMMIT_HOOK"
#!/usr/bin/env bash
# barkcli auto-generated post-commit hook

# 1. barkcli auto checkpoint
barkcli checkpoint save --auto >/dev/null 2>&1 || true

# 2. auto update local mac app if desktop/web files changed
if [[ -f "./scripts/post_commit_update_app.sh" ]]; then
  bash "./scripts/post_commit_update_app.sh" || {
    echo "Warning: Mac app auto-update failed after commit." >&2
  }
fi
EOF

chmod +x "$POST_COMMIT_HOOK"
echo "==> Installed git post-commit hook to $POST_COMMIT_HOOK"
