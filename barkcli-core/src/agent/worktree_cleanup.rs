//! Worktree inventory and safe cleanup.
//!
//! Every agent attempt gets a worktree under `.board/worktrees/<slug>`, and a
//! long-lived project accumulates them: each one is a full checkout of the
//! repository. `git worktree remove` is destructive (it can throw away
//! uncommitted work and unmerged commits), so cleanup is always explicit:
//!
//! * the inventory reports size on disk, merge state, age, and whether a run is
//!   still alive, so a person can see what removing would actually free;
//! * only worktrees that are merged *and* clean, or stale (orphaned directory,
//!   terminal run, old and untouched) are marked removable;
//! * a worktree with a live run, uncommitted changes, or unmerged commits is
//!   never removed, and the caller gets the reason instead;
//! * branches are deleted only when they are merged into the base branch, so a
//!   stale unmerged attempt keeps its commits.
//!
//! Nothing here removes the main checkout: only paths inside
//! `.board/worktrees/` are considered, and every slug goes through the same
//! validation used when the worktree was created.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::agent::worktree::{list_worktrees_in, sanitize_slug};
use crate::agent::worktree_lifecycle::WorktreeStatus;
use crate::runtime::event::{RunRecord, RunStatus};
use crate::runtime::RuntimeStore;
use crate::storage::board_dir::find_project_root;

/// A worktree untouched for this long, with no run attached, is stale.
const STALE_WITHOUT_RUN: Duration = Duration::from_secs(30 * 24 * 60 * 60);
/// A worktree whose last run ended this long ago is stale (merged runs are
/// already covered by the merged branch check).
const STALE_AFTER_RUN: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// `.board/worktrees` for an explicit repository root.
fn worktrees_dir(root: &Path) -> PathBuf {
    root.join(".board").join("worktrees")
}

/// Lifecycle status map for an explicit repository root.
fn load_status_from(root: &Path) -> std::collections::HashMap<String, crate::agent::worktree_lifecycle::WorktreeInfo> {
    std::fs::read_to_string(root.join(".board").join("worktrees").join("status.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeCategory {
    /// Branch is fully merged into the base branch.
    Merged,
    /// Orphaned directory, terminal run, or old and untouched.
    Stale,
    /// A run still owns this worktree.
    Active,
    /// Unmerged work that is not old enough to be called stale.
    Unmerged,
}

impl WorktreeCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            WorktreeCategory::Merged => "merged",
            WorktreeCategory::Stale => "stale",
            WorktreeCategory::Active => "active",
            WorktreeCategory::Unmerged => "unmerged",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeEntry {
    pub slug: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    /// Lifecycle status from `.board/worktrees/status.json`.
    pub status: String,
    pub category: WorktreeCategory,
    /// Bytes the checkout occupies, excluding symlinked build caches.
    pub size_bytes: u64,
    /// Seconds since the worktree was last touched.
    pub age_secs: u64,
    /// Registered with git (`git worktree list`), not just a leftover folder.
    pub registered: bool,
    pub exists: bool,
    pub merged: bool,
    pub dirty: bool,
    pub active: bool,
    pub removable: bool,
    /// Why it can be removed, or what blocks it.
    pub reason: String,
}

impl WorktreeEntry {
    pub fn is_candidate(&self) -> bool {
        self.removable && matches!(self.category, WorktreeCategory::Merged | WorktreeCategory::Stale)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInventory {
    pub base_branch: String,
    pub entries: Vec<WorktreeEntry>,
    /// Total bytes across managed worktrees.
    pub total_bytes: u64,
    /// Bytes that removing every candidate would free.
    pub reclaimable_bytes: u64,
    pub removable_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemovalOutcome {
    pub slug: String,
    pub removed: bool,
    pub reclaimed_bytes: u64,
    pub branch_deleted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupResult {
    pub dry_run: bool,
    /// Entries that were (or, on a dry run, would be) removed.
    pub planned: Vec<WorktreeEntry>,
    /// Entries the server refused to touch, with the reason in `reason`.
    pub skipped: Vec<WorktreeEntry>,
    pub outcomes: Vec<RemovalOutcome>,
    pub removed_count: usize,
    pub reclaimed_bytes: u64,
    pub inventory: WorktreeInventory,
}

fn git(root: &Path, args: &[&str]) -> Result<String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .context(format!("git {} failed to run", args.join(" ")))?;
    if !out.status.success() {
        anyhow::bail!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn git_ok(root: &Path, args: &[&str]) -> bool {
    git(root, args).is_ok()
}

/// The branch worktrees are created from and merged into.
///
/// `bark/*` worktrees start at the main checkout's HEAD, so the current branch
/// of the project root is the right comparison. A detached HEAD falls back to
/// `origin/HEAD`, then the usual default branch names.
pub fn base_branch(root: &Path) -> String {
    if let Ok(name) = git(root, &["rev-parse", "--abbrev-ref", "HEAD"]) {
        if !name.is_empty() && name != "HEAD" {
            return name;
        }
    }
    if let Ok(name) = git(root, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]) {
        if let Some(stripped) = name.strip_prefix("origin/") {
            return stripped.to_string();
        }
        if !name.is_empty() {
            return name;
        }
    }
    for candidate in ["main", "master"] {
        if git_ok(root, &["rev-parse", "--verify", &format!("refs/heads/{candidate}")]) {
            return candidate.to_string();
        }
    }
    "HEAD".to_string()
}

/// True when `branch` is fully contained in `base`.
fn branch_is_merged(root: &Path, branch: &str, base: &str) -> bool {
    if branch.is_empty() || branch == "detached" || branch == base || base == "HEAD" {
        return false;
    }
    git_ok(
        root,
        &["merge-base", "--is-ancestor", branch, base],
    )
}

fn slug_for_path(path: &str) -> String {
    PathBuf::from(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string()
}

fn worktree_is_dirty(path: &Path) -> bool {
    match Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(path)
        .output()
    {
        // Untracked files count: a removal would delete them too.
        Ok(out) => !out.stdout.is_empty(),
        // If git cannot answer, assume there is something worth keeping.
        Err(_) => true,
    }
}

/// Bytes a directory occupies, skipping symlinks so a shared `target/` cache
/// linked into every worktree is not counted (and freed) dozens of times.
fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        // `metadata()` follows symlinks; `symlink_metadata` does not.
        let Ok(link_meta) = std::fs::symlink_metadata(entry.path()) else {
            continue;
        };
        if link_meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            total += directory_size(&entry.path());
        } else {
            total += meta.len();
        }
    }
    total
}

fn secs_since(time: SystemTime) -> u64 {
    SystemTime::now()
        .duration_since(time)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn activity_is_live(ended: bool, pid: Option<u32>, status: &RunStatus) -> bool {
    if ended {
        return false;
    }
    match pid {
        Some(pid) => crate::agent::pid_alive(pid),
        // A run that has not ended and has no PID cannot be proven dead.
        None => !matches!(status, RunStatus::Failed | RunStatus::Cancelled | RunStatus::Interrupted),
    }
}

fn run_is_active(run: &RunRecord) -> bool {
    activity_is_live(run.ended_at.is_some(), run.pid, &run.status)
}

fn latest_run<'a>(runs: &'a [RunRecord], path: &str, branch: Option<&str>) -> Option<&'a RunRecord> {
    runs.iter()
        .filter(|run| {
            run.worktree.as_deref() == Some(path)
                || (branch.is_some() && run.branch.as_deref() == branch)
        })
        .max_by_key(|run| run.started_at)
}

/// Decide the category and removability. Kept pure so the rules are testable
/// without inventing repositories on disk.
fn classify(
    exists: bool,
    merged: bool,
    dirty: bool,
    active: bool,
    stale: bool,
) -> (WorktreeCategory, bool, &'static str) {
    if active {
        return (
            WorktreeCategory::Active,
            false,
            "a run is still using this worktree",
        );
    }
    if merged {
        if dirty {
            return (
                WorktreeCategory::Merged,
                false,
                "merged, but it has uncommitted changes",
            );
        }
        return (WorktreeCategory::Merged, true, "merged into the base branch");
    }
    if stale {
        if dirty {
            return (
                WorktreeCategory::Stale,
                false,
                "stale, but it has uncommitted changes",
            );
        }
        if !exists {
            return (WorktreeCategory::Stale, true, "the directory is already gone");
        }
        return (WorktreeCategory::Stale, true, "stale: no run is using it");
    }
    (
        WorktreeCategory::Unmerged,
        false,
        "has unmerged commits",
    )
}

fn entry_age_secs(path: &Path, status: Option<&crate::agent::worktree_lifecycle::WorktreeInfo>) -> u64 {
    let mut newest = std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .map(secs_since)
        .unwrap_or(u64::MAX);
    if let Some(info) = status {
        let updated_at: SystemTime = info.updated_at.into();
        newest = newest.min(secs_since(updated_at));
    }
    if newest == u64::MAX {
        0
    } else {
        newest
    }
}

/// Build a snapshot of every managed worktree with the facts needed to decide
/// what is safe to remove.
pub fn inventory() -> Result<WorktreeInventory> {
    inventory_at(&find_project_root()?)
}

/// Inventory the worktrees of an explicit repository root.
pub fn inventory_at(root: &Path) -> Result<WorktreeInventory> {
    let canonical_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let root = canonical_root.as_path();
    let base = base_branch(root);
    let wt_root = worktrees_dir(root);
    let persisted = load_status_from(root);
    let runs = RuntimeStore::from_project_root(root)
        .ok()
        .and_then(|store| store.list_runs(None).ok())
        .unwrap_or_default();
    let live = list_worktrees_in(root).unwrap_or_default();

    let mut entries: Vec<WorktreeEntry> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();

    for (path, branch, head) in &live {
        let path_buf = PathBuf::from(path);
        if !path_buf.starts_with(&wt_root) {
            continue;
        }
        seen.insert(path_buf.clone());
        let slug = slug_for_path(path);
        let info = persisted.get(&slug);
        let branch_opt = if branch.is_empty() || branch == "detached" {
            None
        } else {
            Some(branch.clone())
        };
        let latest = latest_run(&runs, path, branch_opt.as_deref());
        let active = latest.map(run_is_active).unwrap_or(false);
        let merged = branch_opt
            .as_deref()
            .map(|b| branch_is_merged(root, b, &base))
            .unwrap_or(false);
        let dirty = path_buf.exists() && worktree_is_dirty(&path_buf);
        let age_secs = entry_age_secs(&path_buf, info);
        let status = info
            .map(|i| i.status.to_string())
            .unwrap_or_else(|| "untracked".to_string());

        let terminal_stale = info
            .map(|i| matches!(i.status, WorktreeStatus::Stale | WorktreeStatus::Failed | WorktreeStatus::Removed))
            .unwrap_or(false);
        let run_stale = latest
            .map(|run| matches!(run.status, RunStatus::Merged | RunStatus::Failed | RunStatus::Cancelled | RunStatus::Interrupted)
                && age_secs > STALE_AFTER_RUN.as_secs())
            .unwrap_or(false);
        let old_and_unused = latest.is_none() && age_secs > STALE_WITHOUT_RUN.as_secs();
        let stale = terminal_stale || run_stale || old_and_unused;

        let (category, removable, reason) = classify(true, merged, dirty, active, stale);
        entries.push(WorktreeEntry {
            slug,
            path: path.clone(),
            branch: branch_opt,
            head_sha: if head.is_empty() { None } else { Some(head.clone()) },
            status,
            category,
            size_bytes: if path_buf.exists() {
                directory_size(&path_buf)
            } else {
                0
            },
            age_secs,
            registered: true,
            exists: path_buf.exists(),
            merged,
            dirty,
            active,
            removable,
            reason: reason.to_string(),
        });
    }

    // Leftover folders that git no longer knows about, plus persisted slugs
    // whose directory is gone (metadata-only cleanup).
    if let Ok(read) = std::fs::read_dir(&wt_root) {
        for entry in read.flatten() {
            let path = entry.path();
            if !path.is_dir() || seen.contains(&path) {
                continue;
            }
            let slug = slug_for_path(&path.to_string_lossy());
            if sanitize_slug(&slug).is_err() {
                continue;
            }
            let info = persisted.get(&slug);
            let age_secs = entry_age_secs(&path, info);
            // A folder git does not know about cannot be serving a live run.
            let (category, removable, reason) = classify(true, false, false, false, true);
            entries.push(WorktreeEntry {
                slug,
                path: path.to_string_lossy().to_string(),
                branch: info.and_then(|i| i.branch.clone()),
                head_sha: info.and_then(|i| i.head_sha.clone()),
                status: info
                    .map(|i| i.status.to_string())
                    .unwrap_or_else(|| "untracked".to_string()),
                category,
                size_bytes: directory_size(&path),
                age_secs,
                registered: false,
                exists: true,
                merged: false,
                dirty: false,
                active: false,
                removable,
                reason: format!("{reason} (git does not list this checkout)"),
            });
        }
    }

    entries.sort_by(|a, b| {
        b.size_bytes
            .cmp(&a.size_bytes)
            .then_with(|| a.slug.cmp(&b.slug))
    });

    let total_bytes = entries.iter().map(|entry| entry.size_bytes).sum();
    let reclaimable_bytes = entries
        .iter()
        .filter(|entry| entry.is_candidate())
        .map(|entry| entry.size_bytes)
        .sum();
    let removable_count = entries.iter().filter(|entry| entry.is_candidate()).count();

    Ok(WorktreeInventory {
        base_branch: base,
        entries,
        total_bytes,
        reclaimable_bytes,
        removable_count,
    })
}

fn mark_removed(root: &Path, slug: &str) {
    let path = worktrees_dir(root).join("status.json");
    let mut map: std::collections::HashMap<String, crate::agent::worktree_lifecycle::WorktreeInfo> =
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
    if let Some(info) = map.get_mut(slug) {
        info.status = WorktreeStatus::Removed;
        info.touch();
        if let Ok(json) = serde_json::to_string_pretty(&map) {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::write(&path, json).ok();
        }
    }
}

/// Remove one worktree after re-checking that it is still a safe candidate.
///
/// Refuses active runs, uncommitted changes, and unmerged work. The branch is
/// deleted only when it is merged into the base branch; otherwise the commits
/// survive on `bark/<slug>`.
pub fn remove_worktree(slug: &str) -> Result<RemovalOutcome> {
    remove_worktree_at(&find_project_root()?, slug)
}

/// Remove one worktree from an explicit repository root.
pub fn remove_worktree_at(root: &Path, slug: &str) -> Result<RemovalOutcome> {
    let canonical_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let root = canonical_root.as_path();
    let clean = sanitize_slug(slug)?;
    let inventory = inventory_at(root)?;
    let entry = inventory
        .entries
        .iter()
        .find(|entry| entry.slug == clean)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("'{}' is not a managed worktree of this project", clean))?;
    if !entry.removable {
        anyhow::bail!("{} — {}", entry.slug, entry.reason);
    }

    let wt_root = worktrees_dir(root);
    let path = wt_root.join(&clean);
    if !path.starts_with(&wt_root) {
        anyhow::bail!("worktree path escapes the worktree root: {}", path.display());
    }

    let reclaimed = entry.size_bytes;
    if path.exists() {
        // `--force` is required for worktrees with ignored build output; the
        // dirty check above guarantees there is no tracked or untracked work.
        let _ = git(
            root,
            &[
                "worktree",
                "remove",
                "--force",
                path.to_str().context("non-utf8 worktree path")?,
            ],
        );
        // Belt and suspenders: a failed git removal must not leave the bytes.
        std::fs::remove_dir_all(&path).ok();
    }
    git(root, &["worktree", "prune"]).ok();

    let mut branch_deleted = false;
    if entry.merged {
        if let Some(branch) = entry.branch.as_deref() {
            // Only ever delete Bark's own branches; a detached HEAD or a user
            // branch is left alone.
            if branch.starts_with("bark/") && git_ok(root, &["branch", "-D", branch]) {
                branch_deleted = true;
            }
        }
    }
    mark_removed(root, &clean);

    Ok(RemovalOutcome {
        slug: clean,
        removed: !path.exists(),
        reclaimed_bytes: if path.exists() { 0 } else { reclaimed },
        branch_deleted,
        error: None,
    })
}

/// Remove several worktrees. A dry run reports exactly what would happen
/// without touching disk, so the UI can ask with real numbers first.
pub fn cleanup(slugs: &[String], dry_run: bool) -> Result<CleanupResult> {
    cleanup_at(&find_project_root()?, slugs, dry_run)
}

/// Remove several worktrees from an explicit repository root.
pub fn cleanup_at(root: &Path, slugs: &[String], dry_run: bool) -> Result<CleanupResult> {
    let canonical_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let root = canonical_root.as_path();
    let snapshot = inventory_at(root)?;
    let mut planned = Vec::new();
    let mut skipped = Vec::new();

    for slug in slugs {
        let Ok(clean) = sanitize_slug(slug) else {
            continue;
        };
        match snapshot
            .entries
            .iter()
            .find(|entry| entry.slug == clean)
        {
            Some(entry) if entry.removable => planned.push(entry.clone()),
            Some(entry) => skipped.push(entry.clone()),
            None => {}
        }
    }

    let mut outcomes = Vec::new();
    let mut removed_count = 0;
    let mut reclaimed_bytes = 0;
    if !dry_run {
        for entry in &planned {
            match remove_worktree_at(root, &entry.slug) {
                Ok(outcome) => {
                    if outcome.removed {
                        removed_count += 1;
                        reclaimed_bytes += outcome.reclaimed_bytes;
                    }
                    outcomes.push(outcome);
                }
                Err(error) => outcomes.push(RemovalOutcome {
                    slug: entry.slug.clone(),
                    removed: false,
                    reclaimed_bytes: 0,
                    branch_deleted: false,
                    error: Some(error.to_string()),
                }),
            }
        }
    }

    // Re-read after removals so the caller renders the new state, not the plan.
    let refreshed = inventory_at(root)?;
    Ok(CleanupResult {
        dry_run,
        planned,
        skipped,
        outcomes,
        removed_count,
        reclaimed_bytes,
        inventory: refreshed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merged_and_clean_is_removable() {
        let (category, removable, reason) = classify(true, true, false, false, false);
        assert_eq!(category, WorktreeCategory::Merged);
        assert!(removable);
        assert!(reason.contains("merged"));
    }

    #[test]
    fn active_run_blocks_even_a_merged_worktree() {
        let (category, removable, _) = classify(true, true, false, true, false);
        assert_eq!(category, WorktreeCategory::Active);
        assert!(!removable);
    }

    #[test]
    fn dirty_worktrees_are_never_removable() {
        let (category, removable, reason) = classify(true, true, true, false, false);
        assert_eq!(category, WorktreeCategory::Merged);
        assert!(!removable);
        assert!(reason.contains("uncommitted"));

        let (_, removable, reason) = classify(true, false, true, false, true);
        assert!(!removable);
        assert!(reason.contains("uncommitted"));
    }

    #[test]
    fn stale_and_clean_is_removable() {
        let (category, removable, _) = classify(true, false, false, false, true);
        assert_eq!(category, WorktreeCategory::Stale);
        assert!(removable);
    }

    #[test]
    fn unmerged_recent_work_is_kept() {
        let (category, removable, reason) = classify(true, false, false, false, false);
        assert_eq!(category, WorktreeCategory::Unmerged);
        assert!(!removable);
        assert!(reason.contains("unmerged"));
    }

    #[cfg(unix)]
    #[test]
    fn directory_size_skips_symlinked_caches() {
        let dir = std::env::temp_dir().join(format!("bark-size-{}", uuid::Uuid::new_v4()));
        let cache = std::env::temp_dir().join(format!("bark-cache-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(dir.join("src/main.rs"), vec![0u8; 1024]).unwrap();
        std::fs::write(cache.join("big.bin"), vec![0u8; 64 * 1024]).unwrap();
        std::os::unix::fs::symlink(&cache, dir.join("target")).unwrap();

        let size = directory_size(&dir);
        assert_eq!(size, 1024, "symlinked build cache must not be counted");

        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(&cache).ok();
    }

    fn sh(dir: &Path, program: &str, args: &[&str]) -> String {
        let out = Command::new(program)
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap_or_else(|error| panic!("{program} {args:?} did not run: {error}"));
        assert!(
            out.status.success(),
            "{program} {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn temp_repo() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bark-worktrees-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        sh(&dir, "git", &["init", "-q"]);
        sh(&dir, "git", &["config", "user.email", "tests@bark.local"]);
        sh(&dir, "git", &["config", "user.name", "Bark Tests"]);
        sh(&dir, "git", &["config", "commit.gpgsign", "false"]);
        std::fs::write(dir.join("README.md"), "init\n").unwrap();
        sh(&dir, "git", &["add", "."]);
        sh(&dir, "git", &["commit", "-q", "-m", "init"]);
        std::fs::create_dir_all(dir.join(".board")).unwrap();
        dir
    }

    fn add_worktree(root: &Path, slug: &str) -> PathBuf {
        let path = root.join(".board").join("worktrees").join(slug);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        sh(
            root,
            "git",
            &[
                "worktree",
                "add",
                "-q",
                path.to_str().unwrap(),
                "-b",
                &format!("bark/{slug}"),
            ],
        );
        path
    }

    #[test]
    fn merged_worktree_is_reported_and_removed() {
        let root = temp_repo();
        let worktree = add_worktree(&root, "merged-one");
        std::fs::write(worktree.join("feature.txt"), "some work\n").unwrap();
        sh(&worktree, "git", &["add", "."]);
        sh(&worktree, "git", &["commit", "-q", "-m", "feature"]);
        sh(&root, "git", &["merge", "-q", "--no-ff", "-m", "merge", "bark/merged-one"]);

        let inventory = inventory_at(&root).unwrap();
        let entry = inventory
            .entries
            .iter()
            .find(|entry| entry.slug == "merged-one")
            .expect("the worktree is listed");
        assert_eq!(entry.category, WorktreeCategory::Merged, "{}", entry.reason);
        assert!(entry.removable, "{}", entry.reason);
        assert!(entry.size_bytes > 0);
        assert!(entry.merged);
        assert_eq!(inventory.removable_count, 1);
        assert!(inventory.reclaimable_bytes >= entry.size_bytes);

        let result = cleanup_at(&root, &["merged-one".to_string()], false).unwrap();
        assert_eq!(result.removed_count, 1);
        assert!(result.reclaimed_bytes > 0);
        assert!(!worktree.exists(), "checkout is gone");
        let branches = sh(&root, "git", &["branch", "--list", "bark/merged-one"]);
        assert!(branches.is_empty(), "merged branch is deleted");

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn dirty_worktree_is_reported_and_kept() {
        let root = temp_repo();
        let worktree = add_worktree(&root, "dirty-one");
        std::fs::write(worktree.join("feature.txt"), "work\n").unwrap();
        sh(&worktree, "git", &["add", "."]);
        sh(&worktree, "git", &["commit", "-q", "-m", "feature"]);
        sh(&root, "git", &["merge", "-q", "--no-ff", "-m", "merge", "bark/dirty-one"]);
        // Uncommitted edit after the merge must block removal.
        std::fs::write(worktree.join("feature.txt"), "changed\n").unwrap();

        let inventory = inventory_at(&root).unwrap();
        let entry = inventory
            .entries
            .iter()
            .find(|entry| entry.slug == "dirty-one")
            .expect("the worktree is listed");
        assert!(entry.dirty);
        assert!(!entry.removable);
        assert!(entry.reason.contains("uncommitted"));

        let result = cleanup_at(&root, &["dirty-one".to_string()], false).unwrap();
        assert_eq!(result.removed_count, 0);
        assert_eq!(result.skipped.len(), 1);
        assert!(worktree.exists(), "uncommitted work survives");

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn orphan_folder_git_forgot_about_is_reclaimable() {
        let root = temp_repo();
        let orphan = root.join(".board").join("worktrees").join("orphan-dir");
        std::fs::create_dir_all(&orphan).unwrap();
        std::fs::write(orphan.join("leftover.bin"), vec![7u8; 2048]).unwrap();

        let inventory = inventory_at(&root).unwrap();
        let entry = inventory
            .entries
            .iter()
            .find(|entry| entry.slug == "orphan-dir")
            .expect("the leftover folder is listed");
        assert!(!entry.registered);
        assert_eq!(entry.category, WorktreeCategory::Stale);
        assert!(entry.removable);
        assert!(entry.size_bytes >= 2048);

        let result = cleanup_at(&root, &["orphan-dir".to_string()], false).unwrap();
        assert_eq!(result.removed_count, 1);
        assert!(!orphan.exists());

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn dry_run_reports_without_deleting() {
        let root = temp_repo();
        let worktree = add_worktree(&root, "merged-two");
        sh(&root, "git", &["merge", "-q", "--no-ff", "-m", "merge", "bark/merged-two"]);

        let result = cleanup_at(&root, &["merged-two".to_string()], true).unwrap();
        assert!(result.dry_run);
        assert_eq!(result.planned.len(), 1);
        assert_eq!(result.removed_count, 0);
        assert!(worktree.exists());

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn only_live_runs_are_active() {
        assert!(activity_is_live(false, Some(std::process::id()), &RunStatus::Running));
        assert!(!activity_is_live(true, Some(std::process::id()), &RunStatus::Merged));
        assert!(!activity_is_live(false, Some(999_999), &RunStatus::Running));
        // No PID and no terminal status: assume it is still running.
        assert!(activity_is_live(false, None, &RunStatus::Waiting));
        assert!(!activity_is_live(false, None, &RunStatus::Cancelled));
    }
}
