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

/// Working-tree diff (uncommitted changes vs HEAD, including untracked files).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitWorkingDiff {
    pub branch: String,
    pub head: String,
    pub clean: bool,
    pub diff: String,
    pub files: Vec<String>,
    pub additions: u32,
    pub deletions: u32,
    /// True when the patch exceeded [`MAX_WORKING_DIFF_BYTES`] and was cut.
    pub truncated: bool,
    pub changes: Vec<GitChange>,
}

const MAX_WORKING_DIFF_BYTES: usize = 2 * 1024 * 1024;
const MAX_UNTRACKED_FILES: usize = 200;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PullRequestAuthor {
    pub login: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullRequestInfo {
    pub number: u64,
    pub title: String,
    pub head_ref: String,
    pub base_ref: String,
    pub state: String,
    pub is_draft: bool,
    pub url: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    pub author: PullRequestAuthor,
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review_decision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullRequestFileChange {
    pub path: String,
    pub additions: u64,
    pub deletions: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub change_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullRequestCommit {
    pub oid: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullRequestComment {
    pub author: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullRequestDetail {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub head_ref: String,
    pub base_ref: String,
    pub state: String,
    pub is_draft: bool,
    pub url: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    pub author: PullRequestAuthor,
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mergeable: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review_decision: Option<String>,
    #[serde(default)]
    pub files: Vec<PullRequestFileChange>,
    #[serde(default)]
    pub commits: Vec<PullRequestCommit>,
    #[serde(default)]
    pub comments: Vec<PullRequestComment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
}

/// A command Bark can offer in the project command runner. These are
/// discovered from real project files, never invented.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunCommand {
    pub id: String,
    pub label: String,
    pub command: String,
}

pub fn detect_commands(root: &Path) -> Vec<RunCommand> {
    let mut commands: Vec<RunCommand> = Vec::new();
    let mut push = |id: &str, label: &str, command: &str| {
        let command = command.trim();
        if command.is_empty() || commands.iter().any(|item| item.command == command) {
            return;
        }
        commands.push(RunCommand {
            id: id.to_string(),
            label: label.to_string(),
            command: command.to_string(),
        });
    };

    if root.join("Cargo.toml").exists() {
        push("cargo-test", "Run Rust tests", "cargo test");
        push("cargo-check", "Check Rust workspace", "cargo check --workspace");
    }
    if let Ok(package) = fs::read_to_string(root.join("package.json")) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&package) {
            if let Some(scripts) = value.get("scripts").and_then(|scripts| scripts.as_object()) {
                let manager = if root.join("pnpm-lock.yaml").exists() {
                    "pnpm"
                } else if root.join("yarn.lock").exists() {
                    "yarn"
                } else {
                    "npm"
                };
                for key in ["test", "build", "lint", "typecheck", "check", "format"] {
                    if scripts.contains_key(key) {
                        let command = match manager {
                            "pnpm" => format!("pnpm {key}"),
                            "yarn" => format!("yarn {key}"),
                            _ => format!("npm run {key}"),
                        };
                        push(
                            &format!("{manager}-{key}"),
                            &format!("Run {}", key),
                            &command,
                        );
                    }
                }
            }
        }
    }
    if root.join("Makefile").exists() {
        push("make-test", "Run make test", "make test");
    }
    if root.join("go.mod").exists() {
        push("go-test", "Run Go tests", "go test ./...");
        push("go-build", "Build Go packages", "go build ./...");
    }
    if root.join("pyproject.toml").exists() {
        push("pytest", "Run Python tests", "pytest");
        push("ruff", "Lint Python", "ruff check .");
    }
    if root.join(".git").exists() {
        push("git-status", "Show working tree", "git status --short");
    }
    commands
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
        .filter(|change| !is_generated_path(&change.path))
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

/// Files barkcli maintains and rewrites for its own context. They should stay
/// out of the ship status so a background digest never looks like user work or
/// blocks a merge. A full `git add -A` commit still includes them.
fn is_generated_path(path: &str) -> bool {
    let path = path.trim();
    path == "project_context.md" || path.ends_with(".board.lock")
}

/// Unified diff of the working tree against HEAD. Untracked (not ignored)
/// files are rendered as new-file diffs so nothing a user typed is invisible
/// in the Review surface.
pub fn git_working_diff(root: &Path) -> Result<GitWorkingDiff> {
    let status = git_status(root)?;

    // `diff HEAD` covers staged + unstaged edits. It fails on a repo with no
    // commits yet, which is fine: untracked files still get rendered below.
    let mut diff = run_git_raw(root, &["diff", "--no-color", "HEAD"]).unwrap_or_default();

    let untracked =
        run_git_raw(root, &["ls-files", "--others", "--exclude-standard"]).unwrap_or_default();
    let mut included = 0usize;
    for path in untracked
        .lines()
        .map(str::trim)
        .filter(|path| !path.is_empty() && !is_generated_path(path))
    {
        if included >= MAX_UNTRACKED_FILES {
            break;
        }
        included += 1;
        // Exits with 1 when the files differ; the patch on stdout is still valid.
        let output = Command::new("git")
            .args(["diff", "--no-color", "--no-index", "--", "/dev/null", path])
            .current_dir(root)
            .output();
        if let Ok(output) = output {
            let text = String::from_utf8_lossy(&output.stdout);
            if !text.trim().is_empty() {
                diff.push_str(&text);
            }
        }
    }

    let mut files: Vec<String> = Vec::new();
    let mut additions = 0u32;
    let mut deletions = 0u32;
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(path) = rest.rsplit_once(" b/").map(|(_, path)| path.trim()) {
                if !is_generated_path(path) && !files.iter().any(|known| known == path) {
                    files.push(path.to_string());
                }
            }
            continue;
        }
        if line.starts_with("+++") || line.starts_with("---") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }

    let truncated = diff.len() > MAX_WORKING_DIFF_BYTES;
    if truncated {
        let mut end = MAX_WORKING_DIFF_BYTES;
        while end > 0 && !diff.is_char_boundary(end) {
            end -= 1;
        }
        let cut = diff[..end].rfind('\n').map(|index| index + 1).unwrap_or(0);
        diff.truncate(cut);
    }

    Ok(GitWorkingDiff {
        branch: status.branch,
        head: status.head,
        clean: status.clean,
        diff,
        files,
        additions,
        deletions,
        truncated,
        changes: status.changes,
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

pub fn git_list_prs(
    root: &Path,
    state: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<PullRequestInfo>> {
    let state_filter = match state.unwrap_or("open").to_lowercase().as_str() {
        "all" => "all",
        "closed" => "closed",
        "merged" => "merged",
        _ => "open",
    };
    let limit_str = limit.unwrap_or(30).clamp(1, 100).to_string();

    let output = Command::new("gh")
        .args([
            "pr",
            "list",
            "--state",
            state_filter,
            "--limit",
            &limit_str,
            "--json",
            "number,title,headRefName,baseRefName,state,url,updatedAt,createdAt,author,reviewDecision,isDraft,additions,deletions,changedFiles",
        ])
        .current_dir(root)
        .output();

    let output = match output {
        Ok(out) => out,
        Err(_) => return Ok(Vec::new()),
    };

    if !output.status.success() {
        return Ok(Vec::new());
    }

    #[derive(Debug, Deserialize)]
    struct RawAuthor {
        login: Option<String>,
        name: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawPr {
        number: u64,
        title: String,
        head_ref_name: Option<String>,
        base_ref_name: Option<String>,
        state: Option<String>,
        is_draft: Option<bool>,
        url: Option<String>,
        updated_at: Option<String>,
        created_at: Option<String>,
        author: Option<RawAuthor>,
        additions: Option<u64>,
        deletions: Option<u64>,
        changed_files: Option<u64>,
        review_decision: Option<String>,
    }

    let parsed: Vec<RawPr> = match serde_json::from_slice(&output.stdout) {
        Ok(items) => items,
        Err(_) => return Ok(Vec::new()),
    };

    let prs = parsed
        .into_iter()
        .map(|pr| PullRequestInfo {
            number: pr.number,
            title: pr.title,
            head_ref: pr.head_ref_name.unwrap_or_default(),
            base_ref: pr.base_ref_name.unwrap_or_else(|| "main".to_string()),
            state: pr.state.unwrap_or_else(|| "OPEN".to_string()),
            is_draft: pr.is_draft.unwrap_or(false),
            url: pr.url.unwrap_or_default(),
            updated_at: pr.updated_at.unwrap_or_default(),
            created_at: pr.created_at,
            author: PullRequestAuthor {
                login: pr
                    .author
                    .as_ref()
                    .and_then(|a| a.login.clone())
                    .unwrap_or_else(|| "unknown".to_string()),
                name: pr.author.and_then(|a| a.name),
            },
            additions: pr.additions.unwrap_or(0),
            deletions: pr.deletions.unwrap_or(0),
            changed_files: pr.changed_files.unwrap_or(0),
            review_decision: pr.review_decision.filter(|s| !s.is_empty()),
        })
        .collect();

    Ok(prs)
}

pub fn git_pr_detail(root: &Path, number: u64) -> Result<PullRequestDetail> {
    let num_str = number.to_string();
    let view_output = Command::new("gh")
        .args([
            "pr",
            "view",
            &num_str,
            "--json",
            "number,title,body,state,isDraft,url,headRefName,baseRefName,author,createdAt,updatedAt,comments,files,commits,additions,deletions,mergeable,reviewDecision",
        ])
        .current_dir(root)
        .output()
        .map_err(|e| anyhow!("gh is not available: {e}"))?;

    if !view_output.status.success() {
        return Err(anyhow!(
            "failed to view pull request #{}: {}",
            number,
            String::from_utf8_lossy(&view_output.stderr).trim()
        ));
    }

    #[derive(Debug, Deserialize)]
    struct RawAuthor {
        login: Option<String>,
        name: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawFile {
        path: String,
        additions: Option<u64>,
        deletions: Option<u64>,
        change_type: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawCommitAuthor {
        login: Option<String>,
        name: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawCommit {
        oid: String,
        message_headline: Option<String>,
        committed_date: Option<String>,
        authors: Option<Vec<RawCommitAuthor>>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawComment {
        author: Option<RawAuthor>,
        body: Option<String>,
        created_at: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawDetail {
        number: u64,
        title: String,
        body: Option<String>,
        state: Option<String>,
        is_draft: Option<bool>,
        url: Option<String>,
        head_ref_name: Option<String>,
        base_ref_name: Option<String>,
        author: Option<RawAuthor>,
        created_at: Option<String>,
        updated_at: Option<String>,
        mergeable: Option<String>,
        review_decision: Option<String>,
        additions: Option<u64>,
        deletions: Option<u64>,
        files: Option<Vec<RawFile>>,
        commits: Option<Vec<RawCommit>>,
        comments: Option<Vec<RawComment>>,
    }

    let parsed: RawDetail = serde_json::from_slice(&view_output.stdout)
        .map_err(|e| anyhow!("failed to parse pull request detail JSON: {e}"))?;

    let diff = Command::new("gh")
        .args(["pr", "diff", &num_str])
        .current_dir(root)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string());

    let files = parsed
        .files
        .unwrap_or_default()
        .into_iter()
        .map(|f| PullRequestFileChange {
            path: f.path,
            additions: f.additions.unwrap_or(0),
            deletions: f.deletions.unwrap_or(0),
            change_type: f.change_type,
        })
        .collect::<Vec<_>>();

    let changed_files = files.len() as u64;

    let commits = parsed
        .commits
        .unwrap_or_default()
        .into_iter()
        .map(|c| {
            let author_name = c
                .authors
                .and_then(|mut a| a.pop())
                .and_then(|a| a.name.or(a.login));
            PullRequestCommit {
                oid: c.oid,
                message: c.message_headline.unwrap_or_default(),
                author: author_name,
                date: c.committed_date,
            }
        })
        .collect();

    let comments = parsed
        .comments
        .unwrap_or_default()
        .into_iter()
        .map(|c| PullRequestComment {
            author: c
                .author
                .and_then(|a| a.login)
                .unwrap_or_else(|| "unknown".to_string()),
            body: c.body.unwrap_or_default(),
            created_at: c.created_at.unwrap_or_default(),
        })
        .collect();

    Ok(PullRequestDetail {
        number: parsed.number,
        title: parsed.title,
        body: parsed.body.unwrap_or_default(),
        head_ref: parsed.head_ref_name.unwrap_or_default(),
        base_ref: parsed.base_ref_name.unwrap_or_else(|| "main".to_string()),
        state: parsed.state.unwrap_or_else(|| "OPEN".to_string()),
        is_draft: parsed.is_draft.unwrap_or(false),
        url: parsed.url.unwrap_or_default(),
        updated_at: parsed.updated_at.unwrap_or_default(),
        created_at: parsed.created_at,
        author: PullRequestAuthor {
            login: parsed
                .author
                .as_ref()
                .and_then(|a| a.login.clone())
                .unwrap_or_else(|| "unknown".to_string()),
            name: parsed.author.and_then(|a| a.name),
        },
        additions: parsed.additions.unwrap_or(0),
        deletions: parsed.deletions.unwrap_or(0),
        changed_files,
        mergeable: parsed.mergeable.filter(|s| !s.is_empty()),
        review_decision: parsed.review_decision.filter(|s| !s.is_empty()),
        files,
        commits,
        comments,
        diff,
    })
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
        fs::write(root.join("project_context.md"), "generated\n").unwrap();
        let status = git_status(&root).unwrap();
        assert!(status.changes.iter().any(|change| change.path.contains("brand-new.txt")));
        assert!(!status.changes.iter().any(|change| change.path.contains("project_context.md")));
        let message = "fix: $(touch SHOULD_NOT_EXIST); `whoami`";
        let commit = git_commit(&root, message, &[]).unwrap();
        assert_eq!(commit.sha.len(), 7);
        assert_eq!(git(&["log", "-1", "--pretty=%s"]), message);
        assert!(!root.join("SHOULD_NOT_EXIST").exists());
        assert!(git_status(&root).unwrap().clean);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn working_diff_includes_edits_and_untracked_files() {
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

        fs::write(root.join("README.md"), "hello\nworld\n").unwrap();
        fs::write(root.join("fresh.txt"), "one\ntwo\n").unwrap();
        fs::write(root.join("project_context.md"), "generated\n").unwrap();

        let diff = git_working_diff(&root).unwrap();
        assert!(diff.diff.contains("+world"));
        assert!(diff.diff.contains("+one"));
        assert!(diff.files.contains(&"README.md".to_string()));
        assert!(diff.files.contains(&"fresh.txt".to_string()));
        assert!(!diff.files.contains(&"project_context.md".to_string()));
        assert!(diff.additions >= 3);
        assert!(!diff.clean);
        assert!(!diff.truncated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn command_detection_uses_real_project_files() {
        let root = temp_root();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("Cargo.toml"), "[package]\nname = \"x\"\n").unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"test":"vitest","build":"vite build","dev":"vite"}}"#,
        )
        .unwrap();
        let commands = detect_commands(&root);
        assert!(commands.iter().any(|item| item.command == "cargo test"));
        assert!(commands.iter().any(|item| item.command == "npm run build"));
        assert!(!commands.iter().any(|item| item.command.contains("dev")));
        assert!(commands.iter().any(|item| item.command == "git status --short"));
        let _ = fs::remove_dir_all(root);
    }

    /// B6.1 / N12: repo path access must not escape the project root.
    #[test]
    fn repo_paths_reject_traversal() {
        let root = temp_root();
        fs::write(root.join("ok.txt"), "ok\n").unwrap();
        assert!(normalize_relative("../etc/passwd").is_err());
        assert!(normalize_relative("/etc/passwd").is_err());
        assert!(normalize_relative("sub/../../etc/passwd").is_err());
        assert!(safe_join(&root, "../etc/passwd", false).is_err());
        assert!(read_file(&root, "../etc/passwd", 1024).is_err());
        let ok = read_file(&root, "ok.txt", 1024).unwrap();
        assert!(ok.content.contains("ok"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn repo_paths_reject_symlink_escape() {
        use std::os::unix::fs::symlink;
        let root = temp_root();
        let outside = std::env::temp_dir().join(format!("bark-outside-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.txt"), "secret\n").unwrap();
        symlink(&outside, root.join("escape")).unwrap();
        let err = read_file(&root, "escape/secret.txt", 1024);
        assert!(err.is_err(), "symlink escape must be rejected: {:?}", err);
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }
}
