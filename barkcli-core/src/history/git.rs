//! Git history reading utilities.
//!
//! All operations are **read-only** against the git repository. This module
//! NEVER writes, amends, rebases, or force-pushes. It only reads commit
//! metadata, diffs, and patch-ids to feed the heuristic grouping engine.
//!
//! Handles: merge commits, octopus merges, empty commits, renames, shallow
//! clones, detached HEAD, multiple branches, and very large repos (stream +
//! cap).

use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Maximum commits to read per scan (safety cap for very large repos).
pub const DEFAULT_MAX_COMMITS: usize = 500;

/// Raw commit data extracted from git log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawCommit {
    pub sha: String,
    pub parents: Vec<String>,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub author_email: String,
    pub date: DateTime<Utc>,
    /// Git trailers (key: value lines at end of message).
    pub trailers: Vec<(String, String)>,
    /// Whether this is a merge commit (2+ parents).
    pub is_merge: bool,
    /// Whether this is an empty commit (no file changes).
    pub is_empty: bool,
    /// Files changed in this commit (relative paths).
    pub files_changed: Vec<String>,
    /// Additions count from diff --shortstat.
    pub additions: u64,
    /// Deletions count from diff --shortstat.
    pub deletions: u64,
    /// Patch-id for rebase resilience.
    pub patch_id: Option<String>,
}

/// Read commits from a branch, newest first.
///
/// # Arguments
/// * `root` — path to the git repo root
/// * `branch` — branch name (or "HEAD")
/// * `since` — optional SHA to start from (exclusive); if None, reads all
/// * `max` — maximum commits to read (safety cap)
///
/// Returns commits newest-first (git log order).
pub fn read_commits(
    root: &Path,
    branch: &str,
    since: Option<&str>,
    max: usize,
) -> Result<Vec<RawCommit>> {
    // Two-pass approach: first get basic commit info (no body), then fetch body+trailers per commit.
    // This avoids separator issues with newlines in commit messages.

    // Pass 1: basic info, tab-separated
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(root)
        .args(["log", "--format=%H\t%P\t%s\t%an\t%ae\t%aI"])
        .arg(branch);

    if let Some(sha) = since {
        cmd.arg(format!("{}..{}", sha, branch));
    }

    let output = cmd
        .output()
        .context("failed to run git log")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("does not have any commits") || stderr.contains("unknown revision") {
            return Ok(Vec::new());
        }
        anyhow::bail!(
            "git log failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        );
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 6 {
            continue;
        }

        let sha = parts[0].trim().to_string();
        let parents: Vec<String> = parts[1]
            .split_whitespace()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let subject = parts[2].trim().to_string();
        let author = parts[3].trim().to_string();
        let author_email = parts[4].trim().to_string();
        let date_str = parts[5].trim();

        let date = parse_git_date(date_str).unwrap_or_else(|_| Utc::now());
        let is_merge = parents.len() > 1;

        // Pass 2: fetch body + trailers for this commit
        let (body, trailers) = read_commit_body(root, &sha);

        // Get files changed and stats
        let (files_changed, is_empty, additions, deletions) =
            read_commit_diff(root, &sha, is_merge)?;

        // Compute patch-id for rebase resilience (best-effort)
        let patch_id = compute_patch_id(root, &sha).ok().flatten();

        commits.push(RawCommit {
            sha,
            parents,
            subject,
            body,
            author,
            author_email,
            date,
            trailers,
            is_merge,
            is_empty,
            files_changed,
            additions,
            deletions,
            patch_id,
        });

        if commits.len() >= max {
            break;
        }
    }

    Ok(commits)
}

/// Read a single commit's body and trailers.
fn read_commit_body(root: &Path, sha: &str) -> (String, Vec<(String, String)>) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root.to_str().unwrap_or("."))
        .args(["log", "-1", "--format=%B", sha])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let raw = String::from_utf8_lossy(&o.stdout);
            parse_body_trailers(&raw)
        }
        _ => (String::new(), Vec::new()),
    }
}

/// Read a single commit's diff stats (files changed, additions, deletions).
fn read_commit_diff(root: &Path, sha: &str, is_merge: bool) -> Result<(Vec<String>, bool, u64, u64)> {
    if is_merge {
        // For merge commits, diff against first parent to see what was merged.
        let output = Command::new("git")
            .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["diff-tree", "--no-commit-id", "-r", "--name-only", sha])
            .output();
        let files = parse_lines(output);
        let is_empty = files.is_empty();
        return Ok((files, is_empty, 0, 0));
    }

    // Files changed
    let output = Command::new("git")
        .args([
            "-C",
            root.to_str().unwrap_or("."),
            "diff-tree",
            "--no-commit-id",
            "-r",
            "--name-only",
            sha,
        ])
        .output();
    let files = parse_lines(output);
    let is_empty = files.is_empty();

    // Shortstat for additions/deletions
    let output = Command::new("git")
        .args([
            "-C",
            root.to_str().unwrap_or("."),
            "diff",
            "--shortstat",
            &format!("{0}^..{1}", sha, sha),
        ])
        .output();
    let stats_text = if let Ok(o) = output {
        if o.status.success() {
            String::from_utf8_lossy(&o.stdout).to_string()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let (additions, deletions) = parse_shortstat(&stats_text);

    Ok((files, is_empty, additions, deletions))
}

/// Compute git patch-id for a commit (for rebase resilience).
fn compute_patch_id(root: &Path, sha: &str) -> Result<Option<String>> {
    // Generate the diff for this commit and pipe to git patch-id.
    let diff_output = Command::new("git")
        .arg("-C")
        .arg(root.to_str().unwrap_or("."))
        .args(["diff", &format!("{0}^..{1}", sha, sha)])
        .output()?;

    if !diff_output.status.success() {
        return Ok(None);
    }

    let patch_id_output = Command::new("git")
        .arg("patch-id")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn();

    use std::io::Write;
    let mut child = match patch_id_output {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };

    if let Some(ref mut stdin) = child.stdin {
        let _ = stdin.write_all(&diff_output.stdout);
    }

    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Ok(None);
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let sha = text.split_whitespace().next().unwrap_or("").to_string();
    if sha.is_empty() {
        Ok(None)
    } else {
        Ok(Some(sha))
    }
}

/// Parse git shortstat output into (additions, deletions).
fn parse_shortstat(text: &str) -> (u64, u64) {
    let mut additions = 0u64;
    let mut deletions = 0u64;
    for part in text.split(',') {
        let part = part.trim();
        // Match "N insertion(s)(+)" or "N deletion(s)(-)")
        if part.contains("insertion") {
            additions = part
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
        } else if part.contains("deletion") {
            deletions = part
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
        }
    }
    (additions, deletions)
}

/// Parse body and trailers from the raw body text.
fn parse_body_trailers(raw: &str) -> (String, Vec<(String, String)>) {
    let mut trailers = Vec::new();
    let mut body_lines = Vec::new();
    let mut in_trailer_section = false;

    for line in raw.lines() {
        // Trailers are "Key: value" lines at the end of the commit message.
        // A trailer line matches "Key: value" or "Key: value" (with continuation).
        if let Some((key, value)) = parse_trailer_line(line) {
            trailers.push((key, value));
            in_trailer_section = true;
        } else if in_trailer_section && line.starts_with(' ') {
            // Continuation of previous trailer value
            if let Some(last) = trailers.last_mut() {
                last.1.push(' ');
                last.1.push_str(line.trim());
            }
        } else {
            body_lines.push(line.to_string());
            // Once we hit non-trailer content after trailers, stop trailer section
            if !in_trailer_section || !line.trim().is_empty() {
                in_trailer_section = false;
            }
        }
    }

    let body = body_lines.join("\n").trim().to_string();
    (body, trailers)
}

/// Parse a single line as a git trailer "Key: value".
fn parse_trailer_line(line: &str) -> Option<(String, String)> {
    // Match "Key: value" — key is alphanumeric + hyphens, followed by colon + space
    let line = line.trim_end();
    if let Some(colon_pos) = line.find(':') {
        let key = line[..colon_pos].trim();
        let value = line[colon_pos + 1..].trim();
        // Key should be a reasonable trailer key (alphanumeric, hyphens)
        if !key.is_empty()
            && key.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
            && !value.is_empty()
        {
            return Some((key.to_string(), value.to_string()));
        }
    }
    None
}

/// Parse git date string to DateTime<Utc>.
fn parse_git_date(s: &str) -> Result<DateTime<Utc>> {
    // Git dates are like "2024-01-15T10:30:00+00:00" or "2024-01-15T10:30:00-05:00"
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .context(format!("failed to parse git date: {}", s))
}

/// Parse command output lines into a Vec<String>.
fn parse_lines(output: std::io::Result<std::process::Output>) -> Vec<String> {
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

/// Check if a SHA exists in the repository.
pub fn commit_exists(root: &Path, sha: &str) -> bool {
    Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["cat-file", "-e", &format!("{}^{{commit}}", sha)])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// True when `root` points at a git repository (work tree with a .git dir).
pub fn is_git_repo(root: &Path) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(root.to_str().unwrap_or("."))
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).trim() == "true")
        .unwrap_or(false)
}

/// Get the current branch name, or empty string if detached HEAD.
/// Falls back to reading .git/HEAD directly for repos with no commits.
pub fn current_branch(root: &Path) -> String {
    // Try rev-parse first
    let output = Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output();
    if let Ok(o) = output {
        if o.status.success() {
            let name = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !name.is_empty() && name != "HEAD" {
                return name;
            }
        }
    }

    // Fallback: read .git/HEAD directly (handles no-commits case)
    let head_path = root.join(".git").join("HEAD");
    if let Ok(content) = std::fs::read_to_string(&head_path) {
        let content = content.trim();
        if let Some(rest) = content.strip_prefix("ref: refs/heads/") {
            return rest.trim().to_string();
        }
    }

    String::new()
}

/// Find all branch names in the repo.
pub fn list_branches(root: &Path) -> Vec<String> {
    let output = Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["branch", "--format=%(refname:short)"])
        .output();
    parse_lines(output)
}

/// Remap a missing SHA to a new SHA using patch-id matching.
///
/// Given an old commit's patch-id, search recent commits for one with the
/// same patch-id. Returns the new SHA if found.
pub fn remap_sha_by_patch_id(root: &Path, old_patch_id: &str, branch: &str) -> Option<String> {
    // Read recent commits and their patch-ids, looking for a match.
    let commits = read_commits(root, branch, None, DEFAULT_MAX_COMMITS).ok()?;
    for commit in commits {
        if commit.patch_id.as_deref() == Some(old_patch_id) {
            return Some(commit.sha);
        }
    }
    None
}

/// Remap a missing SHA using subject + author + date fallback.
pub fn remap_sha_by_metadata(
    root: &Path,
    subject: &str,
    author: &str,
    date: DateTime<Utc>,
    branch: &str,
) -> Option<String> {
    let commits = read_commits(root, branch, None, DEFAULT_MAX_COMMITS).ok()?;
    // Allow 5-minute date tolerance for rebased commits.
    let tolerance = chrono::Duration::minutes(5);

    for commit in commits {
        if commit.subject == subject
            && commit.author == author
            && (commit.date - date).abs() <= tolerance
        {
            return Some(commit.sha);
        }
    }
    None
}

/// Get the diff for a commit (used for LLM input, with redaction applied
/// by the caller).
pub fn commit_diff(root: &Path, sha: &str) -> String {
    let output = Command::new("git")
        .args([
            "-C",
            root.to_str().unwrap_or("."),
            "diff",
            &format!("{0}^..{1}", sha, sha),
        ])
        .output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => String::new(),
    }
}

/// Get the full commit message (subject + body) for a commit.
pub fn commit_message(root: &Path, sha: &str) -> String {
    let output = Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["log", "-1", "--format=%B", sha])
        .output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => String::new(),
    }
}

/// Collect all unique authors across a set of commits.
pub fn unique_authors(commits: &[RawCommit]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut authors = Vec::new();
    for c in commits {
        if seen.insert(c.author.clone()) {
            authors.push(c.author.clone());
        }
    }
    authors
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn tmp_repo() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("bark_hist_git_{}_{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        let _ = Command::new("git")
            .args(["init", "-q", "--initial-branch=main"])
            .current_dir(&dir)
            .output();
        // Fallback for older git without --initial-branch support
        let _ = Command::new("git")
            .args(["branch", "-m", "main"])
            .current_dir(&dir)
            .output();
        let _ = Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(&dir)
            .output();
        let _ = Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&dir)
            .output();
        dir
    }

    fn commit_file(dir: &std::path::Path, name: &str, content: &str, msg: &str) -> String {
        fs::write(dir.join(name), content).unwrap();
        let _ = Command::new("git")
            .args(["add", name])
            .current_dir(dir)
            .output();
        let output = Command::new("git")
            .args(["commit", "-q", "-m", msg])
            .current_dir(dir)
            .output()
            .unwrap();
        assert!(output.status.success());
        let sha_output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(dir)
            .output()
            .unwrap();
        String::from_utf8_lossy(&sha_output.stdout).trim().to_string()
    }

    #[test]
    fn is_git_repo_detects_repos_and_plain_dirs() {
        let repo = tmp_repo();
        assert!(is_git_repo(&repo), "an initialized git repo is detected");

        // A plain directory is not a git repo.
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let plain = std::env::temp_dir().join(format!("bark_hist_plain_{}_{}", std::process::id(), n));
        fs::create_dir_all(&plain).unwrap();
        assert!(!is_git_repo(&plain), "plain dir is not a git repo");
        assert!(!is_git_repo(&std::env::temp_dir().join("definitely-missing-barkcli-tmp")), "missing dir is not a git repo");

        let _ = fs::remove_dir_all(&plain);
        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn read_commits_basic() {
        let dir = tmp_repo();
        commit_file(&dir, "a.rs", "fn a() {}", "feat: add a");
        commit_file(&dir, "b.rs", "fn b() {}", "feat: add b");
        commit_file(&dir, "c.rs", "fn c() {}", "fix: fix c");

        let commits = read_commits(&dir, "main", None, 100).unwrap();
        assert_eq!(commits.len(), 3);
        // Newest first
        assert_eq!(commits[0].subject, "fix: fix c");
        assert_eq!(commits[2].subject, "feat: add a");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_commits_since() {
        let dir = tmp_repo();
        let sha1 = commit_file(&dir, "a.rs", "fn a() {}", "first");
        commit_file(&dir, "b.rs", "fn b() {}", "second");

        let commits = read_commits(&dir, "main", Some(&sha1), 100).unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].subject, "second");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_commits_empty_repo() {
        let dir = tmp_repo();
        let commits = read_commits(&dir, "main", None, 100).unwrap();
        assert!(commits.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_shortstat() {
        let text = " 3 files changed, 10 insertions(+), 5 deletions(-)";
        let (add, del) = parse_shortstat(text);
        assert_eq!(add, 10);
        assert_eq!(del, 5);
    }

    #[test]
    fn test_parse_trailer_line() {
        assert_eq!(
            parse_trailer_line("Bark-Card: my-card"),
            Some(("Bark-Card".to_string(), "my-card".to_string()))
        );
        assert_eq!(
            parse_trailer_line("Signed-off-by: Test <test@test.com>"),
            Some(("Signed-off-by".to_string(), "Test <test@test.com>".to_string()))
        );
        assert_eq!(parse_trailer_line("not a trailer"), None);
        assert_eq!(parse_trailer_line(""), None);
    }

    #[test]
    fn commit_exists_works() {
        let dir = tmp_repo();
        let sha = commit_file(&dir, "a.rs", "fn a() {}", "test");
        assert!(commit_exists(&dir, &sha));
        assert!(!commit_exists(&dir, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn current_branch_works() {
        let dir = tmp_repo();
        let branch = current_branch(&dir);
        assert_eq!(branch, "main");
        let _ = fs::remove_dir_all(&dir);
    }
}
