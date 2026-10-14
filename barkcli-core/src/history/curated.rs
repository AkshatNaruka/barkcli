//! Curated branch export — creates a NEW branch with one commit per bundle.
//!
//! **Safety invariant**: This NEVER touches the original branch. It creates
//! a new branch from the same starting point and cherry-picks or creates
//! one commit per bundle. The original branch is completely untouched.
//!
//! Process:
//! 1. Find the parent of the first commit in the earliest bundle (the fork point)
//! 2. Create a new branch from that fork point
//! 3. For each bundle (in chronological order):
//!    a. Cherry-pick all commits in the bundle onto the new branch
//!    b. Create a single merge commit summarizing the bundle
//! 4. The original branch is never modified, amended, rebased, or force-pushed

use std::path::Path;

use anyhow::{Context, Result};

use crate::models::bundle::Bundle;

/// Create a curated branch with one commit per bundle.
///
/// **Non-destructive**: creates a new branch, never touches the original.
///
/// # Arguments
/// * `root` — path to git repo
/// * `branch` — source branch name (read-only)
/// * `new_branch` — name for the new curated branch
/// * `bundles` — bundles to export (must be in chronological order)
///
/// # Returns
/// The SHA of the tip commit on the new branch.
pub fn export_curated_branch(
    root: &Path,
    branch: &str,
    new_branch: &str,
    bundles: &[Bundle],
) -> Result<String> {
    if bundles.is_empty() {
        anyhow::bail!("no bundles to export");
    }

    // Verify the new branch name doesn't already exist
    let existing = std::process::Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["rev-parse", "--verify", new_branch])
        .output()?;
    if existing.status.success() {
        anyhow::bail!(
            "branch '{}' already exists. Choose a different name or delete it first.",
            new_branch
        );
    }

    // Find the fork point: parent of the earliest commit across all bundles
    let earliest_sha = bundles
        .iter()
        .filter_map(|b| b.range.as_ref())
        .map(|r| &r.first_sha)
        .min_by_key(|sha| {
            bundles
                .iter()
                .flat_map(|b| &b.commits)
                .find(|c| &c.sha == *sha)
                .map(|c| c.date)
                .unwrap_or_else(chrono::Utc::now)
        })
        .context("no commits found in bundles")?;

    // Get the parent of the earliest commit (the fork point)
    let fork_point = get_parent(root, earliest_sha)?
        .context("earliest commit has no parent (root commit)")?;

    // Stash any uncommitted changes (safety)
    let had_changes = has_uncommitted_changes(root)?;
    if had_changes {
        std::process::Command::new("git")
            .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["stash", "push", "-m", "barkcli-curated-export-auto"])
            .output()?;
    }

    // Create the new branch from the fork point
    let status = std::process::Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["checkout", "-b", new_branch, &fork_point])
        .output()?;
    if !status.status.success() {
        // Restore stash if we created one
        if had_changes {
            let _ = std::process::Command::new("git")
                .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["stash", "pop"])
                .output();
        }
        anyhow::bail!(
            "failed to create branch '{}': {}",
            new_branch,
            String::from_utf8_lossy(&status.stderr)
        );
    }

    // Cherry-pick commits bundle by bundle, creating a summary commit per bundle
    for bundle in bundles {
        let mut shas_to_pick: Vec<String> = bundle.commits.iter().map(|c| c.sha.clone()).collect();
        shas_to_pick.sort_by_key(|sha| {
            bundle
                .commits
                .iter()
                .find(|c| &c.sha == sha)
                .map(|c| c.date)
                .unwrap_or_else(chrono::Utc::now)
        });

        for sha in &shas_to_pick {
            let status = std::process::Command::new("git")
                .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["cherry-pick", sha])
                .output()?;
            if !status.status.success() {
                // Abort the cherry-pick and go back to original branch
                let _ = std::process::Command::new("git")
                    .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["cherry-pick", "--abort"])
                    .output();
                let _ = std::process::Command::new("git")
                    .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["checkout", branch])
                    .output();
                let _ = std::process::Command::new("git")
                    .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["branch", "-D", new_branch])
                    .output();
                if had_changes {
                    let _ = std::process::Command::new("git")
                        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["stash", "pop"])
                        .output();
                }
                anyhow::bail!(
                    "cherry-pick of {} failed: {}",
                    sha,
                    String::from_utf8_lossy(&status.stderr)
                );
            }
        }

        // Create a summary commit for this bundle
        let summary_msg = format!(
            "{}: {}\n\n{}\n\nBark-Bundle: {}\nBark-Source: {}/{}",
            bundle.kind.as_str(),
            bundle.title,
            bundle.summary,
            bundle.id,
            branch,
            bundle
                .range
                .as_ref()
                .map(|r| format!("{}..{}", &r.first_sha[..8.min(r.first_sha.len())], &r.last_sha[..8.min(r.last_sha.len())]))
                .unwrap_or_default()
        );

        // Create an empty commit as a marker (preserves the bundle boundary)
        let status = std::process::Command::new("git")
            .args([
                "-C",
                root.to_str().unwrap_or("."),
                "commit",
                "--allow-empty",
                "-m",
                &summary_msg,
            ])
            .output()?;
        if !status.status.success() {
            anyhow::bail!(
                "failed to create summary commit: {}",
                String::from_utf8_lossy(&status.stderr)
            );
        }
    }

    // Go back to the original branch (never leave the user on the new branch)
    std::process::Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["checkout", branch])
        .output()?;

    // Restore stash if we created one
    if had_changes {
        let _ = std::process::Command::new("git")
            .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["stash", "pop"])
            .output();
    }

    // Return the SHA of the tip of the new branch
    let output = std::process::Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["rev-parse", new_branch])
        .output()?;
    let tip_sha = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Ok(tip_sha)
}

/// Get the parent SHA of a commit, or None if it's a root commit.
fn get_parent(root: &Path, sha: &str) -> Result<Option<String>> {
    let output = std::process::Command::new("git")
        .args([
            "-C",
            root.to_str().unwrap_or("."),
            "rev-parse",
            &format!("{}^", sha),
        ])
        .output()?;
    if output.status.success() {
        Ok(Some(
            String::from_utf8_lossy(&output.stdout).trim().to_string(),
        ))
    } else {
        Ok(None)
    }
}

/// Check if the working tree has uncommitted changes.
fn has_uncommitted_changes(root: &Path) -> Result<bool> {
    let output = std::process::Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["status", "--porcelain"])
        .output()?;
    Ok(output.status.success() && !output.stdout.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn tmp_repo() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "bark_curated_{}_{}",
            std::process::id(),
            n
        ));
        fs::create_dir_all(&dir).unwrap();
        let _ = std::process::Command::new("git")
            .args(["init", "-q", "--initial-branch=main"])
            .current_dir(&dir)
            .output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(&dir)
            .output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&dir)
            .output();
        dir
    }

    fn commit_file(dir: &std::path::Path, name: &str, content: &str, msg: &str) -> String {
        fs::write(dir.join(name), content).unwrap();
        let _ = std::process::Command::new("git")
            .args(["add", name])
            .current_dir(dir)
            .output();
        let _ = std::process::Command::new("git")
            .args(["commit", "-q", "-m", msg])
            .current_dir(dir)
            .output();
        let output = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(dir)
            .output()
            .unwrap();
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[test]
    fn export_creates_new_branch() {
        let dir = tmp_repo();
        // Base commit so bundle commits have a parent
        commit_file(&dir, "base.rs", "fn base() {}", "chore: init");
        let sha1 = commit_file(&dir, "a.rs", "fn a() {}", "feat: add a");
        let sha2 = commit_file(&dir, "b.rs", "fn b() {}", "feat: add b");

        let mut bundle = Bundle::new("test-bundle", "Test Bundle", "main");
        bundle.commits.push(crate::models::bundle::CommitRef {
            sha: sha1.clone(),
            patch_id: None,
            subject: "feat: add a".into(),
            author: "Test".into(),
            date: chrono::Utc::now() - chrono::Duration::hours(1),
        });
        bundle.commits.push(crate::models::bundle::CommitRef {
            sha: sha2.clone(),
            patch_id: None,
            subject: "feat: add b".into(),
            author: "Test".into(),
            date: chrono::Utc::now(),
        });
        bundle.recompute_stats();

        let tip = export_curated_branch(&dir, "main", "curated-test", &[bundle]).unwrap();
        assert!(!tip.is_empty());

        // Verify we're back on main
        let branch = std::process::Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(&dir)
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&branch.stdout).trim(), "main");

        // Verify the new branch exists
        let exists = std::process::Command::new("git")
            .args(["rev-parse", "--verify", "curated-test"])
            .current_dir(&dir)
            .output()
            .unwrap();
        assert!(exists.status.success());

        // Verify the new branch has commits
        let log = std::process::Command::new("git")
            .args(["log", "--oneline", "curated-test"])
            .current_dir(&dir)
            .output()
            .unwrap();
        let log_text = String::from_utf8_lossy(&log.stdout);
        assert!(log_text.contains("feat: add a") || log_text.contains("Test Bundle"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_fails_on_existing_branch() {
        let dir = tmp_repo();
        commit_file(&dir, "a.rs", "fn a() {}", "test");

        let bundle = Bundle::new("test", "Test", "main");
        let result = export_curated_branch(&dir, "main", "main", &[bundle]);
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
