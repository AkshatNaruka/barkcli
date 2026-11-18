//! Per-attempt git checkpoints.
//!
//! A retry used to inherit whatever the failed attempt left in the worktree:
//! half-applied edits, generated files, a commit the gate rejected. The retry
//! prompt then described a failure the agent could no longer see, and every
//! attempt piled more noise onto the branch.
//!
//! Before an attempt starts the harness snapshots the worktree:
//!
//! * dirty tracked files are committed (`bark checkpoint: …`) so the snapshot
//!   is a real commit rather than a dangling index;
//! * the commit is tagged `bark/try/<task>/<attempt>`.
//!
//! On a retry (attempt > 1) the worktree is reset to the **attempt-1** tag —
//! the state the task started from — and untracked leftovers are cleaned.
//! `harness.retry_reset = false` keeps the dirty branch for debugging instead.
//! Tags survive the merge and are pruned once the branch lands, so a diff
//! between attempts stays queryable while the attempt is interesting.

use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// What the harness snapshotted before spawning.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Checkpoint {
    pub tag: String,
    pub sha: String,
    /// A dirty tree was committed to make the snapshot meaningful.
    pub committed: bool,
    /// The worktree was reset to the attempt-1 checkpoint first.
    pub reset: bool,
}

/// `bark/try/<task>/<attempt>`, with characters git rejects replaced.
pub fn tag_name(task_id: &str, attempt: usize) -> String {
    format!("bark/try/{}/{}", safe_id(task_id), attempt)
}

fn safe_id(task_id: &str) -> String {
    task_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

fn git(dir: &Path, args: &[&str]) -> Result<String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .with_context(|| format!("git {} failed to run in {}", args.join(" "), dir.display()))?;
    if !out.status.success() {
        anyhow::bail!(
            "git {} failed in {}: {}",
            args.join(" "),
            dir.display(),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn tag_exists(dir: &Path, tag: &str) -> bool {
    git(dir, &["rev-parse", "-q", "--verify", &format!("refs/tags/{}", tag)]).is_ok()
}

/// Snapshot the worktree before an attempt, resetting a retry first.
pub fn prepare(
    worktree: &Path,
    task_id: &str,
    attempt: usize,
    reset_on_retry: bool,
) -> Result<Checkpoint> {
    let mut reset = false;

    if attempt > 1 && reset_on_retry {
        let base = tag_name(task_id, 1);
        // Only rewind when attempt 1 still sits on the current history. A
        // merge-conflict re-dispatch recreates the worktree from a main that
        // already contains other work; resetting there would rewind past it
        // and re-introduce the conflict the re-dispatch exists to fix.
        let rewind_safe = tag_exists(worktree, &base)
            && git(worktree, &["merge-base", "--is-ancestor", &base, "HEAD"]).is_ok();
        if rewind_safe {
            git(worktree, &["reset", "--hard", &base])?;
            // Untracked files are attempt noise (build output, scratch notes),
            // never work the next attempt needs. `-x` is deliberately omitted
            // so ignored caches survive.
            let _ = git(worktree, &["clean", "-fd"]);
            reset = true;
        }
    }

    let mut committed = false;
    if !reset {
        let dirty = git(worktree, &["status", "--porcelain"])?;
        if !dirty.trim().is_empty() {
            // Tracked changes only: `-u` never stages brand-new files, so a
            // checkpoint cannot smuggle untracked artifacts onto the branch.
            git(worktree, &["add", "-u"])?;
            git(
                worktree,
                &[
                    "-c",
                    "core.hooksPath=/dev/null",
                    "commit",
                    "-m",
                    &format!("bark checkpoint: {} attempt {}", safe_id(task_id), attempt),
                    "--no-verify",
                ],
            )?;
            committed = true;
        }
    }

    let sha = git(worktree, &["rev-parse", "HEAD"])?;
    let tag = tag_name(task_id, attempt);
    // `-f`: a rerun of the same attempt moves its own tag, never fails.
    git(worktree, &["tag", "-f", &tag, &sha])?;

    Ok(Checkpoint {
        tag,
        sha,
        committed,
        reset,
    })
}

/// Delete a task's attempt tags. Returns how many were removed.
pub fn prune(root: &Path, task_id: &str) -> usize {
    let pattern = format!("bark/try/{}/*", safe_id(task_id));
    let Ok(listing) = git(root, &["tag", "--list", &pattern]) else {
        return 0;
    };
    let mut removed = 0;
    for tag in listing.lines().map(str::trim).filter(|t| !t.is_empty()) {
        if git(root, &["tag", "-d", tag]).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Repo(PathBuf);

    impl Repo {
        fn new(tag: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "bark-checkpoint-{}-{}",
                tag,
                uuid::Uuid::new_v4()
            ));
            std::fs::create_dir_all(&path).unwrap();
            let repo = Self(path);
            repo.git(&["init", "-q", "-b", "main"]);
            repo.git(&["config", "user.email", "harness@barkcli.test"]);
            repo.git(&["config", "user.name", "bark harness"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            std::fs::write(repo.0.join("app.txt"), "base\n").unwrap();
            repo.git(&["add", "-A"]);
            repo.git(&["commit", "-q", "-m", "base"]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            crate::harness::checkpoint::git(&self.0, args).unwrap()
        }

        fn write(&self, name: &str, body: &str) {
            std::fs::write(self.0.join(name), body).unwrap();
        }

        fn read(&self, name: &str) -> String {
            std::fs::read_to_string(self.0.join(name)).unwrap()
        }

        fn head(&self) -> String {
            self.git(&["rev-parse", "HEAD"])
        }
    }

    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn first_attempt_tags_head_without_committing_a_clean_tree() {
        let repo = Repo::new("clean");
        let head = repo.head();
        let cp = prepare(&repo.0, "task-1", 1, true).unwrap();

        assert_eq!(cp.sha, head);
        assert!(!cp.committed);
        assert!(!cp.reset);
        assert_eq!(cp.tag, "bark/try/task-1/1");
        assert_eq!(repo.git(&["rev-parse", "bark/try/task-1/1"]), head);
    }

    #[test]
    fn dirty_tracked_files_are_committed_into_the_checkpoint() {
        let repo = Repo::new("dirty");
        repo.write("app.txt", "work in progress\n");
        let cp = prepare(&repo.0, "task-2", 1, true).unwrap();

        assert!(cp.committed);
        assert_eq!(repo.git(&["rev-parse", "HEAD"]), cp.sha);
        assert_eq!(repo.read("app.txt"), "work in progress\n");
        // working tree is clean afterwards, so the agent starts from a commit
        assert_eq!(repo.git(&["status", "--porcelain"]), "");
    }

    #[test]
    fn retry_resets_to_the_attempt_one_checkpoint() {
        let repo = Repo::new("retry");
        let base = prepare(&repo.0, "task-3", 1, true).unwrap();
        repo.write("app.txt", "failed attempt\n");
        repo.write("scratch.txt", "untracked noise\n");
        repo.git(&["add", "-A"]);
        repo.git(&["commit", "-q", "-m", "attempt one work"]);

        let retry = prepare(&repo.0, "task-3", 2, true).unwrap();

        assert!(retry.reset);
        assert!(!retry.committed);
        assert_eq!(retry.sha, base.sha, "retry starts where the task started");
        assert_eq!(repo.read("app.txt"), "base\n");
        assert!(!repo.0.join("scratch.txt").exists(), "untracked files cleaned");
        assert_eq!(repo.git(&["rev-parse", "bark/try/task-3/2"]), base.sha);
    }

    #[test]
    fn retry_does_not_rewind_when_the_worktree_was_recreated_on_new_main() {
        let repo = Repo::new("rewind");
        prepare(&repo.0, "task-9", 1, true).unwrap();
        // A merge-conflict re-dispatch recreates the worktree on a main that
        // already contains other work; the attempt-1 tag is no longer an
        // ancestor of HEAD, so resetting would undo that work.
        repo.git(&["checkout", "-q", "--orphan", "rebased"]);
        repo.write("app.txt", "new main\n");
        repo.git(&["add", "-A"]);
        repo.git(&["commit", "-q", "-m", "new base"]);
        repo.git(&["branch", "-M", "rebased", "main"]);

        let retry = prepare(&repo.0, "task-9", 2, true).unwrap();

        assert!(!retry.reset, "must not rewind past landed work");
        assert_eq!(repo.read("app.txt"), "new main\n");
        assert_eq!(repo.git(&["rev-parse", "HEAD"]), retry.sha);
        assert_eq!(repo.git(&["rev-parse", "bark/try/task-9/2"]), retry.sha);
    }

    #[test]
    fn retry_reset_disabled_keeps_the_dirty_branch() {
        let repo = Repo::new("keep");
        prepare(&repo.0, "task-4", 1, true).unwrap();
        repo.write("app.txt", "partial work worth keeping\n");

        let retry = prepare(&repo.0, "task-4", 2, false).unwrap();

        assert!(!retry.reset);
        assert!(retry.committed, "dirty state is checkpointed, not discarded");
        assert_eq!(repo.read("app.txt"), "partial work worth keeping\n");
    }

    #[test]
    fn prune_removes_every_attempt_tag_for_the_task_only() {
        let repo = Repo::new("prune");
        prepare(&repo.0, "task-5", 1, true).unwrap();
        prepare(&repo.0, "task-5", 2, true).unwrap();
        prepare(&repo.0, "other-task", 1, true).unwrap();

        assert_eq!(prune(&repo.0, "task-5"), 2);
        assert_eq!(repo.git(&["tag", "--list", "bark/try/task-5/*"]), "");
        assert_eq!(
            repo.git(&["tag", "--list", "bark/try/other-task/*"]),
            "bark/try/other-task/1"
        );
    }

    #[test]
    fn non_git_directory_is_an_error_not_a_panic() {
        let dir = std::env::temp_dir().join(format!("bark-checkpoint-plain-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(prepare(&dir, "task-6", 1, true).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
