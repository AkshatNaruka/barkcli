//! Scoped repository access used by the review and ship surfaces.
//!
//! Every path that reaches the filesystem goes through [`safe_join`]. That
//! function rejects absolute paths, `..`, and symlink escapes so an API caller
//! cannot read outside the project root. Git operations use argv arrays, never
//! a shell, so branch names and commit messages cannot become commands.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_project_root;

const TREE_SKIP: &[&str] = &[
    ".git",
    ".board",
    ".agents",
    "target",
    "node_modules",
    "dist",
    "desktop/target",
    ".next",
    ".turbo",
    "vendor",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoEntry {
    pub path: String,
    pub name: String,
    /// file | dir
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoFile {
    pub path: String,
    pub content: String,
    pub bytes: u64,
    pub truncated: bool,
    pub binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChange {
    pub status: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub head: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub clean: bool,
    pub changes: Vec<GitChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitResult {
    pub sha: String,
    pub message: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: bool,
}

/// Normalize a relative path without touching the filesystem.
pub fn normalize_relative(relative: &str) -> Result<String> {
    let relative = relative.trim().replace('\\', "/");
    if relative.is_empty() || relative == "." {
        return Ok(".".to_string());
    }
    let path = Path::new(&relative);
    if path.is_absolute() {
        return Err(anyhow!("path must be relative to the project root"));
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                let value = value.to_string_lossy();
                if value.is_empty() {
                    continue;
                }
                parts.push(value.to_string());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(anyhow!("path escapes the project root"));
            }
        }
    }
    if parts.is_empty() {
        Ok(".".to_string())
    } else {
        Ok(parts.join("/"))
    }
}

/// Resolve a relative path inside `root`. Existing paths are canonicalized so
/// symlinks cannot escape; new paths are checked through their nearest parent.
pub fn safe_join(root: &Path, relative: &str, must_exist: bool) -> Result<PathBuf> {
    let normalized = normalize_relative(relative)?;
    let root = fs::canonicalize(root).context("project root is not accessible")?;
    let candidate = if normalized == "." {
        root.clone()
    } else {
        root.join(&normalized)
    };
    let resolved = if candidate.exists() || must_exist {
        fs::canonicalize(&candidate)
            .with_context(|| format!("path '{}' does not exist", normalized))?
    } else {
        let parent = candidate.parent().unwrap_or(&root);
        let parent = fs::canonicalize(parent).unwrap_or_else(|_| root.clone());
        parent.join(candidate.file_name().unwrap_or_default())
    };
    if !resolved.starts_with(&root) {
        return Err(anyhow!("path escapes the project root"));
    }
    Ok(resolved)
}

pub fn list_tree(root: &Path, relative: &str, max_depth: usize) -> Result<Vec<RepoEntry>> {
    let root = fs::canonicalize(root)?;
    let base = safe_join(&root, relative, true)?;
    if !base.is_dir() {
        return Err(anyhow!("'{}' is not a directory", relative));
    }
    let base_relative = normalize_relative(relative)?;
    let max_depth = max_depth.clamp(1, 12);
    let mut out = Vec::new();
    let mut stack = vec![(base, base_relative, 0usize)];
    while let Some((dir, rel, depth)) = stack.pop() {
        if depth >= max_depth {
            continue;
        }
        let mut entries = fs::read_dir(&dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                !TREE_SKIP.iter().any(|skip| {
                    name == *skip || rel == *skip || rel.starts_with(&format!("{skip}/"))
                })
            })
            .collect::<Vec<_>>();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = if rel == "." {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            let file_type = entry.file_type()?;
            if file_type.is_symlink() {
                continue;
            }
            let metadata = entry.metadata().ok();
            if file_type.is_dir() {
                out.push(RepoEntry {
                    path: path.clone(),
                    name,
                    kind: "dir".into(),
                    size: None,
                });
                stack.push((entry.path(), path, depth + 1));
            } else if file_type.is_file() {
                out.push(RepoEntry {
                    path,
                    name,
                    kind: "file".into(),
                    size: metadata.map(|meta| meta.len()),
                });
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

pub fn read_file(root: &Path, relative: &str, max_bytes: usize) -> Result<RepoFile> {
    let path = safe_join(root, relative, true)?;
    let metadata = fs::metadata(&path)?;
    if !metadata.is_file() {
        return Err(anyhow!("'{}' is not a file", relative));
    }
    let bytes = fs::read(&path)?;
    let binary = bytes.iter().take(8192).any(|byte| *byte == 0);
    let truncated = bytes.len() > max_bytes;
    let slice = &bytes[..bytes.len().min(max_bytes)];
    Ok(RepoFile {
        path: normalize_relative(relative)?,
        content: String::from_utf8_lossy(slice).to_string(),
        bytes: metadata.len(),
        truncated,
        binary,
    })
}

pub fn git_status(root: &Path) -> Result<GitStatus> {
    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string());
    let head = run_git(root, &["rev-parse", "--short", "HEAD"]).unwrap_or_default();
    let upstream = run_git(
        root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .ok();
    let (ahead, behind) = run_git(
        root,
        &["rev-list", "--left-right", "--count", "HEAD...@{u}"],
    )
    .ok()
    .and_then(|text| {
        let mut parts = text.split_whitespace();
        Some((
            parts.next()?.parse::<u32>().ok()?,
            parts.next()?.parse::<u32>().ok()?,
        ))
    })
    .unwrap_or((0, 0));
    let changes = run_git_raw(root, &["status", "--porcelain"])?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let status = line.get(0..2).unwrap_or("??").trim().to_string();
            let path = line.get(3..).unwrap_or("").trim().to_string();
            GitChange { status, path }
        })
        .collect::<Vec<_>>();
    Ok(GitStatus {
        branch,
        head,
        upstream,
        ahead,
        behind,
        clean: changes.is_empty(),
        changes,
    })
}

pub fn git_commit(root: &Path, message: &str, paths: &[String]) -> Result<GitCommitResult> {
    let message = message.trim();
    if message.is_empty() {
        return Err(anyhow!("commit message is required"));
    }
    if paths.is_empty() {
        run_git(root, &["add", "-A"])?;
    } else {
        for path in paths {
            let normalized = normalize_relative(path)?;
            run_git(root, &["add", "-A", "--", &normalized])?;
        }
    }
    run_git(root, &["commit", "-m", message])?;
    let sha = run_git(root, &["rev-parse", "--short", "HEAD"])?;
    let files = run_git(root, &["show", "--pretty=", "--name-only", "HEAD"])?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.to_string())
        .collect();
    Ok(GitCommitResult {
        sha,
        message: message.to_string(),
        files,
    })
}

pub fn git_push(root: &Path, remote: &str, branch: &str, dry_run: bool) -> Result<String> {
    let remote = remote.trim();
    let branch = branch.trim();
    if remote.is_empty() || branch.is_empty() {
        return Err(anyhow!("remote and branch are required"));
    }
    if remote.starts_with('-') || branch.starts_with('-') {
        return Err(anyhow!("remote and branch cannot start with '-'"));
    }
    let mut args = vec!["push"];
    if dry_run {
        args.push("--dry-run");
    }
    args.push(remote);
    args.push(branch);
    run_git(root, &args)
}

pub fn git_merge(root: &Path, branch: &str, message: Option<&str>) -> Result<String> {
    let branch = branch.trim();
    if branch.is_empty() || branch.starts_with('-') {
        return Err(anyhow!("a valid branch is required"));
    }
    let mut args = vec!["merge", "--no-ff", "--no-edit"];
    if let Some(message) = message.filter(|message| !message.trim().is_empty()) {
        args.push("-m");
        args.push(message);
    }
    args.push(branch);
    run_git(root, &args)
}

pub fn git_pr_args(
    title: &str,
    body: &str,
    base: Option<&str>,
    draft: bool,
    dry_run: bool,
) -> Vec<String> {
    let mut args = vec!["pr".into(), "create".into(), "--title".into(), title.into()];
    args.push("--body".into());
    args.push(body.into());
    if let Some(base) = base.filter(|base| !base.trim().is_empty()) {
        args.push("--base".into());
        args.push(base.into());
    }
    if draft {
        args.push("--draft".into());
    }
    if dry_run {
        args.push("--dry-run".into());
    }
    args
}

pub fn git_pr(
    root: &Path,
    title: &str,
    body: &str,
    base: Option<&str>,
    draft: bool,
    dry_run: bool,
) -> Result<String> {
    if title.trim().is_empty() {
        return Err(anyhow!("pull request title is required"));
    }
    if dry_run {
        return Ok(format!(
            "gh {}",
            git_pr_args(title, body, base, draft, true).join(" ")
        ));
    }
    let output = Command::new("gh")
        .args(git_pr_args(title, body, base, draft, false))
        .current_dir(root)
        .output()
        .map_err(|error| anyhow!("gh is not available: {error}"))?;
    if !output.status.success() {
        return Err(anyhow!(
            "gh pr create failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn git_worktrees(root: &Path) -> Result<Vec<WorktreeInfo>> {
    let output = run_git_raw(root, &["worktree", "list", "--porcelain"])?;
    let mut worktrees = Vec::new();
    let mut current = WorktreeInfo {
        path: String::new(),
        head: String::new(),
        branch: None,
        bare: false,
        detached: false,
        locked: false,
    };
    let mut flush = |worktree: &mut WorktreeInfo| {
        if !worktree.path.is_empty() {
            worktrees.push(worktree.clone());
        }
        *worktree = WorktreeInfo {
            path: String::new(),
            head: String::new(),
            branch: None,
            bare: false,
            detached: false,
            locked: false,
        };
    };
    for line in output.lines() {
        if line.trim().is_empty() {
            flush(&mut current);
            continue;
        }
        if let Some(value) = line.strip_prefix("worktree ") {
            current.path = value.to_string();
        } else if let Some(value) = line.strip_prefix("HEAD ") {
            current.head = value.to_string();
        } else if let Some(value) = line.strip_prefix("branch ") {
            current.branch = Some(
                value
                    .strip_prefix("refs/heads/")
                    .unwrap_or(value)
                    .to_string(),
            );
        } else if line == "bare" {
            current.bare = true;
        } else if line == "detached" {
            current.detached = true;
        } else if line.starts_with("locked") {
            current.locked = true;
        }
    }
    flush(&mut current);
    Ok(worktrees)
}

pub fn project_root() -> Result<PathBuf> {
    find_project_root()
}

fn run_git(root: &Path, args: &[&str]) -> Result<String> {
    Ok(run_git_raw(root, args)?.trim().to_string())
}

fn run_git_raw(root: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| anyhow!("git is not available: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!(
            "git {} failed: {}",
            args.first().copied().unwrap_or(""),
            stderr.trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "bark_repo_{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {}\n").unwrap();
        fs::write(root.join("README.md"), "hello\n").unwrap();
        root
    }

    #[test]
    fn path_escape_is_rejected() {
        let root = temp_root();
        assert!(normalize_relative("../secret").is_err());
        assert!(normalize_relative("/etc/passwd").is_err());
        assert!(safe_join(&root, "../secret", false).is_err());
        assert!(normalize_relative("./src/../src/main.rs").is_err());
        assert_eq!(normalize_relative("./src/main.rs").unwrap(), "src/main.rs");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn symlink_escape_is_rejected() {
        let root = temp_root();
        let outside = std::env::temp_dir().join(format!(
            "bark_outside_{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::write(&outside, "secret").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, root.join("leak")).unwrap();
        assert!(safe_join(&root, "leak", true).is_err());
        let _ = fs::remove_file(outside);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn tree_and_file_read_are_scoped() {
        let root = temp_root();
        let entries = list_tree(&root, ".", 3).unwrap();
        assert!(entries.iter().any(|entry| entry.path == "src/main.rs"));
        let file = read_file(&root, "src/main.rs", 1024).unwrap();
        assert!(file.content.contains("fn main"));
        assert!(!file.truncated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pr_arguments_are_argv_safe() {
        let args = git_pr_args("title; rm -rf /", "body $(whoami)", Some("main"), true, true);
        assert!(args.contains(&"title; rm -rf /".to_string()));
        assert!(args.contains(&"body $(whoami)".to_string()));
        assert!(args.contains(&"--draft".to_string()));
    }

    #[test]
    fn git_status_and_commit_include_untracked_files_without_shell_injection() {
        let root = temp_root();
        let git = |args: &[&str]| {
            let output = Command::new("git")
                .args(args)
                .current_dir(&root)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "git {:?}: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        };
        git(&["init"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        git(&["add", "-A"]);
        git(&["commit", "-m", "base"]);

        fs::write(root.join("brand-new.txt"), "new\n").unwrap();
        let status = git_status(&root).unwrap();
        assert!(status.changes.iter().any(|change| change.path.contains("brand-new.txt")));
        let message = "fix: $(touch SHOULD_NOT_EXIST); `whoami`";
        let commit = git_commit(&root, message, &[]).unwrap();
        assert_eq!(commit.sha.len(), 7);
        assert_eq!(git(&["log", "-1", "--pretty=%s"]), message);
        assert!(!root.join("SHOULD_NOT_EXIST").exists());
        assert!(git_status(&root).unwrap().clean);
        let _ = fs::remove_dir_all(root);
    }
}
