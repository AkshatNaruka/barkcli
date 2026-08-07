use std::path::Path;
use std::process::Command;

/// Minimal git helpers for context syncing. All failures degrade gracefully —
/// a non-git repo simply yields empty results.

pub fn is_repo(root: &Path) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("rev-parse")
        .arg("--git-dir")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn current_commit(root: &Path) -> Option<String> {
    Command::new("git")
        .args(["-C", root.to_str()?, "rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Files changed in the last commit (HEAD vs HEAD~1). Empty if no commits yet.
pub fn last_commit_files(root: &Path) -> Vec<String> {
    let output = Command::new("git")
        .args(["-C", root.to_str().unwrap_or("."), "diff", "--name-only", "HEAD~1", "HEAD"])
        .output();
    parse_lines(output)
}

/// Files with uncommitted changes (working tree + staged).
pub fn dirty_files(root: &Path) -> Vec<String> {
    let output = Command::new("git")
        .args(["-C", root.to_str().unwrap_or("."), "status", "--porcelain"])
        .output();
    let mut files = Vec::new();
    if let Ok(o) = output {
        if o.status.success() {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                let line = line.trim();
                if line.len() > 3 {
                    // `XY path` or `XY "path"` — strip quotes
                    let path = line[3..].trim_matches('"');
                    if !path.is_empty() {
                        files.push(path.to_string());
                    }
                }
            }
        }
    }
    files
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn tmp_repo() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("bark_core_git_{}_{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        let _ = Command::new("git").args(["init", "-q"]).current_dir(&dir).output();
        dir
    }

    #[test]
    fn not_a_repo() {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("bark_core_git_{}_{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        assert!(!is_repo(&dir));
        assert!(current_commit(&dir).is_none());
        assert!(last_commit_files(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dirty_files_detected() {
        let dir = tmp_repo();
        fs::write(dir.join("a.rs"), "fn a() {}").unwrap();
        let dirty = dirty_files(&dir);
        assert!(dirty.iter().any(|f| f == "a.rs"));
        let _ = fs::remove_dir_all(&dir);
    }
}
