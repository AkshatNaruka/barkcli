use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};

pub const MAX_CONCURRENT_WORKTREES: usize = 8;

/// Validate a worktree slug. Rejects path traversal (`..`, `/`, `\`),
/// leading/trailing dots, empty strings, and non-alphanumeric chars.
pub fn sanitize_slug(slug: &str) -> Result<String> {
    let slug = slug.trim();
    if slug.is_empty() {
        anyhow::bail!("worktree slug cannot be empty");
    }
    if slug.len() > 64 {
        anyhow::bail!("worktree slug is too long (max 64 chars): '{}'", slug);
    }
    if slug.contains("..") || slug.contains('/') || slug.contains('\\') || slug.starts_with('.') || slug.ends_with('.') {
        anyhow::bail!("path traversal or invalid dots in worktree slug: '{}'", slug);
    }
    if !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        anyhow::bail!("slug contains invalid characters (only letters, numbers, '_' and '-' allowed): '{}'", slug);
    }
    Ok(slug.to_string())
}

/// Root for agent worktrees: `<repo>/.board/worktrees/` (gitignored).
pub fn worktrees_root() -> Result<PathBuf> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let root = board_dir
        .parent()
        .context("fatal: .board is at filesystem root")?
        .join(".board")
        .join("worktrees");
    std::fs::create_dir_all(&root).ok();
    Ok(root)
}

fn project_root() -> Result<PathBuf> {
    crate::storage::board_dir::find_project_root()
}

/// True when the main checkout has uncommitted *tracked* changes.
/// Agents must never inherit a dirty tree — refuse acquisition instead.
/// Untracked files (e.g. fresh `.board/` output) are ignored: git worktrees
/// are created at HEAD and do not inherit them.
pub fn main_is_dirty() -> Result<bool> {
    let root = project_root()?;
    let out = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&root)
        .output()
        .context("git status failed — is this a git repo?")?;
    if !out.status.success() {
        return Ok(true);
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.starts_with("??"))
        .any(|l| {
            let path = if l.len() >= 3 { l[3..].trim() } else { "" };
            !path.ends_with(".board")
                && path != "project_context.md"
                && !path.ends_with(".board.lock")
        }))
}

fn git_in(root: &PathBuf, args: &[&str]) -> Result<String> {
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

/// Acquire an isolated worktree for a task.
///
/// Creates `.board/worktrees/<slug>` on a fresh branch `bark/<slug>`
/// from HEAD. Safe even when the main checkout has uncommitted changes
/// (worktrees are isolated and do not inherit the working tree).
/// Fails if the slug is invalid or the worktree/branch already exists.
/// Enforces `MAX_CONCURRENT_WORKTREES`.
pub fn acquire_worktree(slug: &str) -> Result<PathBuf> {
    let clean_slug = sanitize_slug(slug)?;
    let root = project_root()?;
    let wt_root = worktrees_root()?;
    let path = wt_root.join(&clean_slug);

    if !path.starts_with(&wt_root) {
        anyhow::bail!("worktree path escapes root: {}", path.display());
    }

    if path.exists() {
        anyhow::bail!(
            "worktree '{}' already acquired at {}",
            clean_slug,
            path.display()
        );
    }

    // Check active managed worktrees against quota
    let active = list_worktrees().unwrap_or_default();
    let managed_count = active.iter().filter(|(p, _, _)| is_managed_worktree(p)).count();
    if managed_count >= MAX_CONCURRENT_WORKTREES {
        // Try auto-pruning stale worktrees
        let _ = prune_stale_worktrees();
        let active_after = list_worktrees().unwrap_or_default();
        let count_after = active_after.iter().filter(|(p, _, _)| is_managed_worktree(p)).count();
        if count_after >= MAX_CONCURRENT_WORKTREES {
            anyhow::bail!(
                "maximum concurrent worktrees ({}) reached; release or clean inactive worktrees before starting new ones",
                MAX_CONCURRENT_WORKTREES
            );
        }
    }

    let branch = format!("bark/{}", clean_slug);
    // Fail if branch already exists (resume path should reuse explicitly).
    let branches = git_in(&root, &["branch", "--list", &branch])?;
    if !branches.is_empty() {
        anyhow::bail!(
            "branch '{}' already exists; remove it or resume the existing session",
            branch
        );
    }

    git_in(
        &root,
        &[
            "worktree",
            "add",
            path.to_str().context("non-utf8 worktree path")?,
            "-b",
            &branch,
        ],
    )?;

    // Configure shared build cache (e.g. symlinking target) to conserve disk and memory
    let _ = setup_shared_build_cache(&path);

    Ok(path)
}

/// Release a worktree: remove it and prune git metadata.
/// `delete_branch` also deletes `bark/<slug>` (use after successful merge).
pub fn release_worktree(slug: &str, delete_branch: bool) -> Result<()> {
    let clean_slug = sanitize_slug(slug)?;
    let root = project_root()?;
    let wt_root = worktrees_root()?;
    let path = wt_root.join(&clean_slug);

    if !path.starts_with(&wt_root) {
        anyhow::bail!("worktree path escapes root: {}", path.display());
    }

    if path.exists() {
        git_in(
            &root,
            &[
                "worktree",
                "remove",
                "--force",
                path.to_str().context("non-utf8 worktree path")?,
            ],
        )
        .ok();
        // Belt and suspenders: remove dir if git left it behind.
        std::fs::remove_dir_all(&path).ok();
    }
    git_in(&root, &["worktree", "prune"])?;

    if delete_branch {
        let branch = format!("bark/{}", clean_slug);
        git_in(&root, &["branch", "-D", &branch]).ok();
    }
    Ok(())
}

/// Parse `git worktree list --porcelain` into (path, branch, commit) rows.
pub fn list_worktrees() -> Result<Vec<(String, String, String)>> {
    list_worktrees_in(&project_root()?)
}

/// Same as [`list_worktrees`] for an explicit repository root, so callers that
/// already resolved the project (the server, cleanup tests) do not depend on
/// the process working directory.
pub fn list_worktrees_in(root: &Path) -> Result<Vec<(String, String, String)>> {
    let root = root.to_path_buf();
    let out = git_in(&root, &["worktree", "list", "--porcelain"])?;
    let mut rows = Vec::new();
    let (mut path, mut branch, mut commit) = (String::new(), String::new(), String::new());
    let flush = |path: &mut String, branch: &mut String, commit: &mut String, rows: &mut Vec<(String, String, String)>| {
        if !path.is_empty() {
            rows.push((
                std::mem::take(path),
                std::mem::take(branch),
                std::mem::take(commit),
            ));
        }
    };
    for line in out.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            flush(&mut path, &mut branch, &mut commit, &mut rows);
            path = p.to_string();
        } else if let Some(b) = line.strip_prefix("branch refs/heads/") {
            branch = b.to_string();
        } else if let Some(h) = line.strip_prefix("HEAD ") {
            commit = h.to_string();
        } else if line == "bare" || line == "detached" {
            branch = line.to_string();
        }
    }
    flush(&mut path, &mut branch, &mut commit, &mut rows);
    Ok(rows)
}

/// True if `path` is inside a bark-managed worktree.
pub fn is_managed_worktree(path: &str) -> bool {
    worktrees_root()
        .map(|r| {
            PathBuf::from(path)
                .starts_with(&r)
                || path.contains(".board/worktrees/")
        })
        .unwrap_or(false)
}

/// RAII guard for an acquired worktree.
/// If dropped before being marked successful or explicitly kept,
/// it automatically releases the worktree and prunes git metadata,
/// ensuring zero orphaned directories or leaked disk space.
pub struct WorktreeGuard {
    pub slug: String,
    pub path: PathBuf,
    preserved: bool,
}

impl WorktreeGuard {
    pub fn acquire(slug: &str) -> Result<Self> {
        let path = acquire_worktree(slug)?;
        Ok(Self {
            slug: slug.to_string(),
            path,
            preserved: false,
        })
    }

    /// Mark the worktree as preserved (e.g. when successfully merged or handed off),
    /// so the Drop implementation will not release or delete it.
    pub fn preserve(&mut self) {
        self.preserved = true;
    }

    /// Explicitly release the worktree immediately.
    pub fn release(mut self, delete_branch: bool) -> Result<()> {
        self.preserved = true;
        release_worktree(&self.slug, delete_branch)
    }
}

impl Drop for WorktreeGuard {
    fn drop(&mut self) {
        if !self.preserved {
            let _ = release_worktree(&self.slug, false);
        }
    }
}

/// Configure a shared compilation cache for a worktree to conserve disk space.
/// Directs `target` or package caches to a centralized repository location.
pub fn setup_shared_build_cache(worktree_path: &Path) -> Result<()> {
    let root = project_root()?;
    let shared_target = root.join("target");
    let wt_target = worktree_path.join("target");

    // If the main project has a target directory and the worktree does not yet have one
    if shared_target.exists() && !wt_target.exists() {
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&shared_target, &wt_target).ok();
        }
    }
    Ok(())
}

/// Configure sparse checkout inside a worktree to only populate necessary directories.
pub fn configure_sparse_checkout(worktree_path: &Path, paths: &[&str]) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["sparse-checkout", "set", "--no-cone"];
    args.extend_from_slice(paths);
    let out = Command::new("git")
        .args(&args)
        .current_dir(worktree_path)
        .output()
        .context("git sparse-checkout set failed")?;
    if !out.status.success() {
        anyhow::bail!(
            "git sparse-checkout failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

/// Prune stale or orphaned worktree directories under `.board/worktrees/`.
/// Returns the count of cleaned up worktrees.
pub fn prune_stale_worktrees() -> Result<usize> {
    let wt_root = worktrees_root()?;
    if !wt_root.exists() {
        return Ok(0);
    }

    let active_worktrees = list_worktrees().unwrap_or_default();
    let active_paths: std::collections::HashSet<PathBuf> = active_worktrees
        .iter()
        .map(|(p, _, _)| PathBuf::from(p))
        .collect();

    let mut pruned_count = 0;

    // 1. Remove physical directories not registered in git's worktree list
    if let Ok(entries) = std::fs::read_dir(&wt_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if !active_paths.contains(&path) {
                    if std::fs::remove_dir_all(&path).is_ok() {
                        pruned_count += 1;
                    }
                }
            }
        }
    }

    // 2. Identify active worktrees that belong to completed/terminal runs or dead PIDs
    let runs = crate::runtime::RuntimeStore::from_project()
        .ok()
        .and_then(|s| s.list_runs(None).ok())
        .unwrap_or_default();

    for (p, b, _) in &active_worktrees {
        if !is_managed_worktree(p) {
            continue;
        }
        let p_buf = PathBuf::from(p);
        let slug = match p_buf.file_name().and_then(|n| n.to_str()) {
            Some(s) => s,
            None => continue,
        };

        let matching_run = runs.iter().find(|r| {
            r.worktree.as_deref().map(Path::new) == Some(Path::new(p))
                || r.branch.as_deref() == Some(b)
        });

        if let Some(run) = matching_run {
            let is_dead = run.pid.map(|pid| !crate::agent::pid_alive(pid)).unwrap_or(true);
            let is_stale_terminal = match run.status {
                crate::runtime::RunStatus::Merged => true,
                crate::runtime::RunStatus::Cancelled if is_dead => true,
                crate::runtime::RunStatus::Failed if is_dead && run.diff_stats.files == 0 => true,
                _ => false,
            };

            if is_stale_terminal {
                if release_worktree(slug, true).is_ok() {
                    pruned_count += 1;
                }
            }
        }
    }

    let root = project_root()?;
    let _ = git_in(&root, &["worktree", "prune"]);

    Ok(pruned_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_managed_worktree() {
        assert!(is_managed_worktree("/foo/bar/.board/worktrees/task-1"));
        assert!(!is_managed_worktree("/foo/bar/src/main.rs"));
    }

    #[test]
    fn test_sanitize_slug_valid() {
        assert_eq!(sanitize_slug("task-123").unwrap(), "task-123");
        assert_eq!(sanitize_slug("fix_auth_bug").unwrap(), "fix_auth_bug");
        assert_eq!(sanitize_slug("run_5ab22505").unwrap(), "run_5ab22505");
    }

    #[test]
    fn test_sanitize_slug_rejects_traversal() {
        assert!(sanitize_slug("../../evil").is_err());
        assert!(sanitize_slug("..").is_err());
        assert!(sanitize_slug("/etc/passwd").is_err());
        assert!(sanitize_slug("foo/bar").is_err());
        assert!(sanitize_slug("foo\\bar").is_err());
        assert!(sanitize_slug(".hidden").is_err());
        assert!(sanitize_slug("trailing.").is_err());
        assert!(sanitize_slug("   ").is_err());
    }
}
