use std::path::PathBuf;
use std::process::Command;

use anyhow::{Context, Result};

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
        .any(|l| !l.starts_with("??")))
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
/// from clean HEAD. Fails if main is dirty or the worktree exists.
pub fn acquire_worktree(slug: &str) -> Result<PathBuf> {
    let root = project_root()?;
    let wt_root = worktrees_root()?;
    let path = wt_root.join(slug);

    if path.exists() {
        anyhow::bail!(
            "worktree '{}' already acquired at {}",
            slug,
            path.display()
        );
    }
    if main_is_dirty()? {
        anyhow::bail!(
            "refusing: main checkout is dirty (uncommitted changes). Commit or stash first — agents never inherit a dirty tree."
        );
    }

    let branch = format!("bark/{}", slug);
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
    Ok(path)
}

/// Release a worktree: remove it and prune git metadata.
/// `delete_branch` also deletes `bark/<slug>` (use after successful merge).
pub fn release_worktree(slug: &str, delete_branch: bool) -> Result<()> {
    let root = project_root()?;
    let wt_root = worktrees_root()?;
    let path = wt_root.join(slug);

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
        let branch = format!("bark/{}", slug);
        git_in(&root, &["branch", "-D", &branch]).ok();
    }
    Ok(())
}

/// Parse `git worktree list --porcelain` into (path, branch, commit) rows.
pub fn list_worktrees() -> Result<Vec<(String, String, String)>> {
    let root = project_root()?;
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
