//! Unified-diff parsing and git scope resolution.
//!
//! Guard needs more than line counts: checks need the added lines and, for
//! dependency checks, the full file at the scanned revision. `DiffSet`
//! therefore carries both.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Maximum bytes read for one file's contents.
const MAX_FILE_BYTES: u64 = 512 * 1024;
/// Maximum bytes read across all files in one scan.
const MAX_TOTAL_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffScope {
    /// All tracked uncommitted changes (`git diff HEAD`).
    Worktree,
    /// Staged changes only (`git diff --cached`).
    Staged,
    /// Any git revision range.
    Range(String),
}

impl DiffScope {
    pub fn label(&self) -> String {
        match self {
            Self::Worktree => "HEAD".to_string(),
            Self::Staged => "--cached".to_string(),
            Self::Range(range) => range.clone(),
        }
    }

    fn git_arg(&self) -> String {
        match self {
            Self::Worktree => "HEAD".to_string(),
            Self::Staged => "--cached".to_string(),
            Self::Range(range) => range.clone(),
        }
    }

    /// The revision whose file contents should be read for `Range` scopes.
    fn head_rev(&self) -> Option<String> {
        match self {
            Self::Range(range) => {
                let right = range
                    .split_once("...")
                    .map(|(_, right)| right)
                    .or_else(|| range.split_once("..").map(|(_, right)| right))
                    .unwrap_or(range);
                Some(right.trim().to_string()).filter(|s| !s.is_empty())
            }
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Binary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiffLine {
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangedFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub added: Vec<DiffLine>,
    pub removed: Vec<DiffLine>,
}

impl ChangedFile {
    fn new(path: String) -> Self {
        Self {
            path,
            old_path: None,
            status: FileStatus::Modified,
            additions: 0,
            deletions: 0,
            added: Vec::new(),
            removed: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct DiffSet {
    pub base: String,
    pub head: String,
    pub files: Vec<ChangedFile>,
    /// Full contents of changed, non-deleted, non-binary files at `head`.
    pub contents: HashMap<String, String>,
}

impl DiffSet {
    pub fn content(&self, path: &str) -> Option<&str> {
        self.contents.get(path).map(String::as_str)
    }

    pub fn paths(&self) -> impl Iterator<Item = &str> {
        self.files.iter().map(|file| file.path.as_str())
    }

    /// (files, additions, deletions)
    pub fn stats(&self) -> (u32, u32, u32) {
        let additions = self.files.iter().map(|file| file.additions).sum();
        let deletions = self.files.iter().map(|file| file.deletions).sum();
        (self.files.len() as u32, additions, deletions)
    }

    pub fn added_lines(&self) -> impl Iterator<Item = (&ChangedFile, &DiffLine)> {
        self.files
            .iter()
            .flat_map(|file| file.added.iter().map(move |line| (file, line)))
    }

    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }
}

/// Parse a `git diff -U0 --no-color` payload.
pub fn parse_unified_diff(text: &str) -> Vec<ChangedFile> {
    let mut files: Vec<ChangedFile> = Vec::new();
    let mut current: Option<ChangedFile> = None;
    let mut in_hunk = false;
    let mut old_line = 0u32;
    let mut new_line = 0u32;

    for raw in text.lines() {
        if let Some(rest) = raw.strip_prefix("diff --git ") {
            if let Some(file) = current.take() {
                files.push(file);
            }
            let path = parse_diff_git_path(rest);
            current = Some(ChangedFile::new(path));
            in_hunk = false;
            continue;
        }

        let Some(file) = current.as_mut() else {
            continue;
        };

        if raw.starts_with("new file mode") {
            file.status = FileStatus::Added;
        } else if raw.starts_with("deleted file mode") {
            file.status = FileStatus::Deleted;
        } else if let Some(path) = raw.strip_prefix("rename from ") {
            file.old_path = Some(unescape_git_path(path));
            file.status = FileStatus::Renamed;
        } else if let Some(path) = raw.strip_prefix("rename to ") {
            file.path = unescape_git_path(path);
            file.status = FileStatus::Renamed;
        } else if raw.starts_with("GIT binary patch")
            || (raw.starts_with("Binary files ") && raw.ends_with(" differ"))
        {
            file.status = FileStatus::Binary;
        } else if let Some(rest) = raw.strip_prefix("+++ ") {
            if let Some(path) = parse_header_path(rest) {
                file.path = path;
            }
        } else if let Some(rest) = raw.strip_prefix("--- ") {
            if let Some(path) = parse_header_path(rest) {
                if file.old_path.is_none() && file.status == FileStatus::Renamed {
                    file.old_path = Some(path);
                }
            }
        } else if let Some(rest) = raw.strip_prefix("@@ ") {
            if let Some((a, b)) = parse_hunk_header(rest) {
                old_line = a;
                new_line = b;
                in_hunk = true;
            }
        } else if in_hunk && raw.starts_with('+') {
            file.added.push(DiffLine {
                old_line: None,
                new_line: Some(new_line),
                text: raw[1..].to_string(),
            });
            file.additions += 1;
            new_line += 1;
        } else if in_hunk && raw.starts_with('-') {
            file.removed.push(DiffLine {
                old_line: Some(old_line),
                new_line: None,
                text: raw[1..].to_string(),
            });
            file.deletions += 1;
            old_line += 1;
        } else if in_hunk && raw.starts_with(' ') {
            old_line += 1;
            new_line += 1;
        }
    }

    if let Some(file) = current.take() {
        files.push(file);
    }
    files
}

fn parse_diff_git_path(rest: &str) -> String {
    // `a/path b/path` — take the b-side when present.
    let mut parts = rest.rsplitn(2, ' ');
    let b = parts.next().unwrap_or(rest);
    unescape_git_path(b.trim_start_matches("b/"))
}

fn parse_header_path(rest: &str) -> Option<String> {
    let rest = rest.split('\t').next().unwrap_or(rest).trim();
    if rest == "/dev/null" {
        return None;
    }
    Some(unescape_git_path(rest.trim_start_matches("b/").trim_start_matches("a/")))
}

fn unescape_git_path(path: &str) -> String {
    let path = path.trim();
    if path.len() >= 2 && path.starts_with('"') && path.ends_with('"') {
        let inner = &path[1..path.len() - 1];
        return inner
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .replace("\\t", "\t")
            .replace("\\n", "\n");
    }
    path.to_string()
}

/// Parse `-a,b +c,d @@` from a hunk header.
fn parse_hunk_header(rest: &str) -> Option<(u32, u32)> {
    let mut parts = rest.split(' ');
    let old = parts.next()?.trim_start_matches('-');
    let new = parts.next()?.trim_start_matches('+');
    let old_start = old.split(',').next()?.parse::<u32>().ok()?;
    let new_start = new.split(',').next()?.parse::<u32>().ok()?;
    Some((old_start, new_start))
}

/// Run `git diff` for `scope` and load file contents for checks.
pub fn diff_for_scope(root: &Path, scope: &DiffScope) -> Result<DiffSet> {
    let mut head = match scope {
        DiffScope::Worktree => "WORKTREE".to_string(),
        DiffScope::Staged => "INDEX".to_string(),
        DiffScope::Range(_) => scope.head_rev().unwrap_or_else(|| "HEAD".to_string()),
    };

    if !has_head(root) && matches!(scope, DiffScope::Worktree | DiffScope::Staged) {
        return Ok(DiffSet {
            base: "HEAD".into(),
            head,
            files: Vec::new(),
            contents: HashMap::new(),
        });
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["diff", "-U0", "--no-color", "--find-renames"])
        .arg(scope.git_arg())
        .arg("--")
        .output()
        .context("failed to run git diff")?;

    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "git diff failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let files = parse_unified_diff(&text);
    let contents = load_contents(root, scope, &files);
    if head.is_empty() {
        head = "HEAD".to_string();
    }

    Ok(DiffSet {
        base: scope.label(),
        head,
        files,
        contents,
    })
}

fn has_head(root: &Path) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["rev-parse", "--verify", "HEAD"])
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

fn load_contents(
    root: &Path,
    scope: &DiffScope,
    files: &[ChangedFile],
) -> HashMap<String, String> {
    let mut contents = HashMap::new();
    let mut total = 0usize;
    let head_rev = scope.head_rev();

    for file in files {
        if file.status == FileStatus::Deleted || file.status == FileStatus::Binary {
            continue;
        }
        if total >= MAX_TOTAL_BYTES {
            break;
        }

        let text = match &head_rev {
            Some(rev) => read_from_rev(root, rev, &file.path),
            None => read_from_disk(root, &file.path),
        };

        if let Some(text) = text {
            total += text.len();
            contents.insert(file.path.clone(), text);
        }
    }
    contents
}

fn read_from_disk(root: &Path, path: &str) -> Option<String> {
    let full = root.join(path);
    let meta = std::fs::metadata(&full).ok()?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return None;
    }
    std::fs::read_to_string(full).ok()
}

fn read_from_rev(root: &Path, rev: &str, path: &str) -> Option<String> {
    let spec = format!("{}:{}", rev, path);
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["show", &spec])
        .output()
        .ok()?;
    if !output.status.success() || output.stdout.len() as u64 > MAX_FILE_BYTES {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git").arg("-C").arg(dir).args(args).output().unwrap();
        assert!(
            out.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn temp_repo(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bark_guard_diff_{}_{}",
            name,
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&dir).unwrap();
        git(&dir, &["init", "-q"]);
        git(&dir, &["config", "user.email", "test@example.com"]);
        git(&dir, &["config", "user.name", "Test"]);
        dir
    }

    fn commit_all(dir: &Path, message: &str) {
        git(dir, &["add", "-A"]);
        git(dir, &["commit", "-q", "-m", message]);
    }

    #[test]
    fn parses_added_lines_with_new_line_numbers() {
        let diff = "\
diff --git a/src/lib.rs b/src/lib.rs
index 111..222 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -1,0 +2,2 @@ fn main() {
+let a = 1;
+let b = 2;
";
        let files = parse_unified_diff(diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/lib.rs");
        assert_eq!(files[0].additions, 2);
        assert_eq!(files[0].added[0].new_line, Some(2));
        assert_eq!(files[0].added[1].text, "let b = 2;");
    }

    #[test]
    fn parses_removals_and_modifications() {
        let diff = "\
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -3,2 +3,1 @@
-old
-gone
+new
";
        let files = parse_unified_diff(diff);
        assert_eq!(files[0].deletions, 2);
        assert_eq!(files[0].additions, 1);
        assert_eq!(files[0].removed[0].old_line, Some(3));
        assert_eq!(files[0].removed[1].old_line, Some(4));
    }

    #[test]
    fn parses_new_deleted_and_renamed_files() {
        let diff = "\
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,1 @@
+hello
diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
diff --git a/from.txt b/to.txt
rename from from.txt
rename to to.txt
";
        let files = parse_unified_diff(diff);
        assert_eq!(files[0].status, FileStatus::Added);
        assert_eq!(files[1].status, FileStatus::Deleted);
        assert_eq!(files[2].status, FileStatus::Renamed);
        assert_eq!(files[2].old_path.as_deref(), Some("from.txt"));
        assert_eq!(files[2].path, "to.txt");
    }

    #[test]
    fn parses_binary_marker() {
        let diff = "\
diff --git a/logo.png b/logo.png
new file mode 100644
Binary files /dev/null and b/logo.png differ
";
        let files = parse_unified_diff(diff);
        assert_eq!(files[0].status, FileStatus::Binary);
    }

    #[test]
    fn ignores_header_lines_beginning_with_plus() {
        let diff = "\
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,1 +1,1 @@
-old
+new
";
        let files = parse_unified_diff(diff);
        assert_eq!(files[0].additions, 1);
        assert_eq!(files[0].added.len(), 1);
        assert_eq!(files[0].added[0].text, "new");
    }

    #[test]
    fn worktree_scope_includes_staged_changes() {
        let dir = temp_repo("worktree");
        fs::write(dir.join("a.txt"), "one\n").unwrap();
        commit_all(&dir, "init");
        fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();
        git(&dir, &["add", "a.txt"]);
        fs::write(dir.join("b.txt"), "be\n").unwrap();
        git(&dir, &["add", "b.txt"]);

        let set = diff_for_scope(&dir, &DiffScope::Worktree).unwrap();
        assert_eq!(set.files.len(), 2);
        assert!(set.content("b.txt").is_some());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn range_scope_uses_both_refs() {
        let dir = temp_repo("range");
        fs::write(dir.join("a.txt"), "one\n").unwrap();
        commit_all(&dir, "init");
        git(&dir, &["checkout", "-q", "-b", "feat"]);
        fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();
        commit_all(&dir, "feat");

        let set = diff_for_scope(&dir, &DiffScope::Range("HEAD~1..feat".into())).unwrap();
        assert_eq!(set.files.len(), 1);
        assert_eq!(set.files[0].additions, 1);
        assert_eq!(set.head, "feat");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn empty_repo_returns_empty_set() {
        let dir = temp_repo("empty");
        let set = diff_for_scope(&dir, &DiffScope::Worktree).unwrap();
        assert!(set.is_empty());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn loads_contents_for_changed_text_files() {
        let dir = temp_repo("contents");
        fs::write(dir.join("a.txt"), "one\n").unwrap();
        commit_all(&dir, "init");
        fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();

        let set = diff_for_scope(&dir, &DiffScope::Worktree).unwrap();
        assert_eq!(set.content("a.txt"), Some("one\ntwo\n"));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn skips_binary_and_deleted_contents() {
        let dir = temp_repo("binary");
        fs::write(dir.join("gone.txt"), "bye\n").unwrap();
        fs::write(dir.join("logo.png"), b"\x00\x01\x02").unwrap();
        commit_all(&dir, "init");
        fs::remove_file(dir.join("gone.txt")).unwrap();
        fs::write(dir.join("logo.png"), b"\x00\x03\x04").unwrap();

        let set = diff_for_scope(&dir, &DiffScope::Worktree).unwrap();
        assert!(set.content("gone.txt").is_none());
        assert!(set.content("logo.png").is_none());
        fs::remove_dir_all(dir).ok();
    }
}
