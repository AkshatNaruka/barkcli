#!/usr/bin/env bash
set -euo pipefail

# auto_release_on_master.sh
# Automatically bumps version, tags, and triggers releases when changes are merged into master.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IS_CI=false
for arg in "$@"; do
  if [[ "$arg" == "--ci" ]]; then
    IS_CI=true
  fi
done

# Current branch verification
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
echo "==> Checking release status on branch: ${CURRENT_BRANCH:-detached}"

# Identify latest tag
LATEST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "")"
if [[ -z "$LATEST_TAG" ]]; then
  LATEST_TAG="v0.4.0"
fi

echo "==> Latest release tag: $LATEST_TAG"

# Check if there are commits since latest tag
COMMITS_SINCE="$(git rev-list "${LATEST_TAG}..HEAD" --count 2>/dev/null || echo "1")"
if [[ "$COMMITS_SINCE" -eq 0 ]]; then
  echo "No new commits since $LATEST_TAG. Skipping release generation."
  exit 0
fi

echo "==> Found $COMMITS_SINCE new commit(s) since $LATEST_TAG."

# Extract semver numbers: major.minor.patch
RAW_VER="${LATEST_TAG#v}"
IFS='.' read -r MAJOR MINOR PATCH <<< "$RAW_VER"
NEXT_PATCH=$((PATCH + 1))
NEXT_VERSION="${MAJOR}.${MINOR}.${NEXT_PATCH}"
NEXT_TAG="v${NEXT_VERSION}"

echo "==> Auto-bumping release version: $RAW_VER -> $NEXT_VERSION ($NEXT_TAG)"

# Bump Cargo.toml and desktop configuration files
python3 - "$NEXT_VERSION" <<'PY'
import re, pathlib, sys, json

ver = sys.argv[1]
crates = [
    "barkcli-core/Cargo.toml",
    "barkcli-tui/Cargo.toml",
    "barkcli-server/Cargo.toml",
    "barkcli-cli/Cargo.toml",
    "desktop/Cargo.toml",
]

for crate in crates:
    p = pathlib.Path(crate)
    if p.exists():
        txt = p.read_text()
        txt = re.sub(r'^version = "[^"]+"', f'version = "{ver}"', txt, flags=re.MULTILINE)
        txt = re.sub(r'(barkcli-[a-z-]+ = \{[^}]*version = ")[^"]+"', rf'\g<1>{ver}"', txt)
        p.write_text(txt)
        print(f"Updated {crate} to version {ver}")

tauri_conf = pathlib.Path("desktop/tauri.conf.json")
if tauri_conf.exists():
    data = json.loads(tauri_conf.read_text())
    data["version"] = ver
    tauri_conf.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Updated desktop/tauri.conf.json to version {ver}")
PY

# Generate release notes from git log
CHANGELOG=$(git log "${LATEST_TAG}..HEAD" --pretty=format:"* %s (%h)" --no-merges)
if [[ -z "$CHANGELOG" ]]; then
  CHANGELOG="* Maintenance release with updates merged into master."
fi

echo "==> Release Notes:"
echo "$CHANGELOG"

# Git commit and tag
git config user.name "${GIT_AUTHOR_NAME:-github-actions[bot]}"
git config user.email "${GIT_AUTHOR_EMAIL:-github-actions[bot]@users.noreply.github.com}"

git add barkcli-*/Cargo.toml desktop/Cargo.toml desktop/tauri.conf.json
if ! git diff --cached --quiet; then
  git commit -m "chore(release): bump version to ${NEXT_TAG} [skip ci]"
fi

# Create annotated tag
git tag -a "$NEXT_TAG" -m "Release $NEXT_TAG

Changes:
$CHANGELOG"

echo "==> Successfully created tag $NEXT_TAG"

# If in CI or requested, push tag and commit
if [[ "$IS_CI" == "true" ]]; then
  echo "==> Pushing release commit and tag $NEXT_TAG to origin..."
  git push origin HEAD:master
  git push origin "$NEXT_TAG"
  echo "==> Pushed! GitHub Actions will now build and publish the release."
else
  echo "==> Run 'git push origin master --tags' to publish this release."
fi
