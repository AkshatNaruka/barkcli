# Smart History Bundles

AI-assisted grouping of git commits into feature "bundles" so a noisy commit history becomes readable.

## Overview

Frequent commits (often by AI agents) make git history a flat, noisy list. Smart History Bundles groups related commits into named bundles — a metadata overlay on top of git. **Git history is never modified.**

## Concepts

- **Bundle**: A group of related commits with a title, summary, kind, and confidence.
- **Kind**: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, or `mixed`.
- **Status**: `open` (can absorb new commits) or `sealed` (immutable).
- **Unsorted**: Low-confidence commits that don't fit any bundle.
- **Source**: `heuristic` (deterministic), `llm` (AI-refined), or `human` (manually created/approved).

## CLI Commands

```bash
# Scan commits into bundles
barkcli history scan [--since <sha>] [--all] [--branch <name>] [--no-llm]

# Continuous monitoring
barkcli history watch [--interval <sec>]

# Install git hooks (safe, chains with existing hooks)
barkcli history install-hooks
barkcli history uninstall-hooks

# View bundle tree
barkcli history tree

# Validate bundles (dangling SHAs, overlaps, orphans)
barkcli history validate

# Bundle operations
barkcli bundle list [--kind <k>] [--status <s>] [--branch <b>]
barkcli bundle show <id>
barkcli bundle rename <id> <title>
barkcli bundle merge <source> <target>
barkcli bundle split <id> <sha>
barkcli bundle move <sha> <from> <to>
barkcli bundle seal <id>
barkcli bundle approve <id>
barkcli bundle reject <id>
barkcli bundle export [--format markdown|json] [--curated-branch <name>]
```

## Git Hooks

```bash
barkcli history install-hooks
```

Installs four hooks in `.git/hooks/`:
- `post-commit`: triggers incremental scan after each commit
- `post-merge`: triggers scan after merge
- `post-rewrite`: triggers rebase resilience remap
- `prepare-commit-msg`: appends `Bark-Card:` / `Bark-Bundle:` trailers when known

Hooks are **opt-in** and never overwrite existing ones. They chain safely by appending to existing hook files.

## Curated Branch Export

```bash
barkcli bundle export --curated-branch my-feature
```

Creates a **new branch** with one commit per bundle. The original branch is **never touched**. The export process:
1. Finds the fork point (parent of the earliest commit)
2. Creates a new branch from that point
3. Cherry-picks commits bundle by bundle
4. Creates a summary commit per bundle
5. Returns to the original branch

## Safety Invariants

1. **Never rewrites git history** — no amend, rebase, or force-push.
2. **All git operations are read-only** — bundles are a metadata overlay.
3. **Curated export creates a new branch** — original branch untouched.
4. **Idempotent** — re-scanning never duplicates or reshuffles sealed bundles.
5. **Concurrency-safe** — file locking via advisory locks (same pattern as task queue).
6. **AI proposes, human approves** — low-confidence commits go to Unsorted.
7. **LLM is optional** — works fully offline with deterministic heuristics.
8. **Secrets redacted** — diffs are redacted before any LLM call.

## Architecture

```
barkcli-core/src/history/
├── mod.rs          # Public API: scan, list, get, merge, split, move, seal, approve, reject
├── git.rs          # Git reading (read-only): log, diff, patch-id, rebase remapping
├── heuristics.rs   # Pure deterministic grouping engine (no I/O, unit-testable)
├── store.rs        # Bundle persistence: .board/bundles/ (YAML files + index + cursor)
├── llm.rs          # Optional LLM refinement (same pattern as intake)
├── hooks.rs        # Git hook install/uninstall (safe chaining)
└── curated.rs      # Curated branch export (non-destructive)
```

## Configuration

```bash
# Disable LLM refinement (default: enabled when AI is configured)
export BARKCLI_NO_HISTORY_LLM=1
```

## Integration

- **Web app**: History tab shows bundle cards with filters, actions (approve/reject/seal), and expandable commit lists.
- **TUI**: Tab 9 shows a navigable tree of bundles → commits.
- **MCP**: 10 tools (`history_scan`, `bundle_list`, `bundle_get`, `bundle_propose`, `bundle_approve`, `bundle_reject`, `bundle_merge`, `bundle_split`, `bundle_move_commit`, `bundle_seal`).
- **mind_snapshot**: includes `bundle_stats` (total, open, sealed, unsorted).
- **memory_add**: approved bundle summaries can be recorded via memory.

## Data Model

Bundles are stored as YAML files under `.board/bundles/`:
- `index.yaml` — lightweight metadata for fast listing
- `<id>.yaml` — full bundle data
- `cursor.json` — last processed SHA per branch (incremental scan)

Each bundle includes a schema version for forward compatibility.

## Rebase Resilience

If a commit SHA is missing (history was rewritten):
1. Try `git patch-id` remap (find commit with same patch-id)
2. Fallback: match on subject + author + date (5-minute tolerance)
3. Unresolved: flagged in validation, marked as dangling
