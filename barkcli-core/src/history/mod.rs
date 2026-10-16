//! Smart History Bundles — AI-assisted grouping of git commits into feature bundles.
//!
//! This module provides the full pipeline:
//! 1. Read commits from git (read-only)
//! 2. Group into candidate bundles using deterministic heuristics
//! 3. Optionally refine with an LLM
//! 4. Persist as metadata overlay (never modifies git history)
//! 5. Support incremental scans, rebase resilience, and bundle operations
//!
//! # Safety invariants
//! - NEVER rewrites, amends, rebases, or force-pushes git history
//! - All git operations are read-only
//! - Curated branch export creates a NEW branch, never touches original
//! - All file operations are concurrency-safe via advisory locking

pub mod curated;
pub mod git;
pub mod heuristics;
pub mod hooks;
pub mod llm;
pub mod store;

use std::path::Path;

use anyhow::{Context, Result};

use crate::history::heuristics::{group_commits, title_for_group, HeuristicConfig};
use crate::history::store::{
    cursor_for_branch, load_all_bundles, open_bundles, remove_bundle, unsorted_bundle,
    update_cursor, upsert_bundle, validate_bundles,
};
use crate::models::bundle::{Bundle, BundleKind, BundleSource, BundleStatus};

/// Configuration for a scan operation.
pub struct ScanConfig {
    pub branch: String,
    pub since: Option<String>,
    pub max_commits: usize,
    pub use_llm: bool,
    pub heuristic: HeuristicConfig,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            branch: "HEAD".into(),
            since: None,
            max_commits: git::DEFAULT_MAX_COMMITS,
            use_llm: true,
            heuristic: HeuristicConfig::default(),
        }
    }
}

/// Result of a scan operation.
pub struct ScanResult {
    pub bundles_created: usize,
    pub bundles_updated: usize,
    pub commits_processed: usize,
    pub unsorted_count: usize,
}

/// Run a full scan: read commits → group → refine → persist.
///
/// This is idempotent: re-running with the same history produces the same
/// bundles (no duplicates). Sealed and approved bundles are never modified.
pub fn scan(root: &Path, config: &ScanConfig) -> Result<ScanResult> {
    if !git::is_git_repo(root) {
        anyhow::bail!(
            "history scan needs a git repository, but '{}' is not one — \
             cd into your git repo (run `barkcli init` inside it if it has no .board yet) and try again",
            root.display()
        );
    }

    let branch = &config.branch;

    // Determine where to start reading
    let since = config
        .since
        .clone()
        .or_else(|| cursor_for_branch(branch));

    // Read commits (read-only)
    let raw_commits = git::read_commits(root, branch, since.as_deref(), config.max_commits)?;

    if raw_commits.is_empty() {
        // Update cursor even if no new commits
        if let Some(latest) = git::read_commits(root, branch, None, 1)?.first() {
            update_cursor(branch, &latest.sha)?;
        }
        return Ok(ScanResult {
            bundles_created: 0,
            bundles_updated: 0,
            commits_processed: 0,
            unsorted_count: 0,
        });
    }

    // The newest commit in this batch becomes the new cursor
    let newest_sha = raw_commits[0].sha.clone();

    // Group using heuristics
    let candidates = group_commits(&raw_commits, branch, &config.heuristic);

    // Optionally refine with LLM
    let candidates = if config.use_llm {
        llm::refine_candidates(root, branch, candidates)?
    } else {
        candidates
    };

    // Load existing open bundles for incremental merge
    let existing_open = open_bundles(branch)?;

    // Track stats
    let mut created = 0;
    let mut updated = 0;
    let mut unsorted_count = 0;

    // Track which SHAs are already placed in a bundle (to avoid double-counting)
    let mut placed_shas: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Match candidates to existing bundles or create new ones
    for candidate in &candidates {
        // Skip low-confidence singletons — they go to Unsorted instead
        if candidate.commits.len() <= 1 && candidate.confidence < 0.6 {
            for commit in &candidate.commits {
                placed_shas.insert(commit.sha.clone());
            }
            unsorted_count += candidate.commits.len();
            continue;
        }

        let title = title_for_group(candidate);

        // Check if this candidate matches an existing open bundle
        let matched = existing_open.iter().find(|b| {
            if let Some(card) = &candidate.card_id {
                b.card_id.as_deref() == Some(card.as_str())
            } else {
                candidate
                    .commits
                    .iter()
                    .any(|c| b.has_commit(&c.sha))
            }
        });

        if let Some(existing) = matched {
            let mut bundle = existing.clone();
            for commit in &candidate.commits {
                if !bundle.has_commit(&commit.sha) {
                    bundle.add_commit(commit.clone());
                    placed_shas.insert(commit.sha.clone());
                }
            }
            bundle.confidence = candidate.confidence;
            bundle.source = if config.use_llm {
                BundleSource::Llm
            } else {
                BundleSource::Heuristic
            };
            upsert_bundle(&bundle)?;
            updated += 1;
        } else {
            let id = crate::util::slug::to_slug(&title);
            let mut bundle = Bundle::new(&id, &title, branch);
            bundle.kind = candidate.kind;
            bundle.confidence = candidate.confidence;
            bundle.card_id = candidate.card_id.clone();
            bundle.source = if config.use_llm {
                BundleSource::Llm
            } else {
                BundleSource::Heuristic
            };

            for commit in &candidate.commits {
                bundle.add_commit(commit.clone());
                placed_shas.insert(commit.sha.clone());
            }

            let mut files = std::collections::HashSet::new();
            for commit in &candidate.commits {
                let raw = raw_commits.iter().find(|c| c.sha == commit.sha);
                if let Some(raw) = raw {
                    for f in &raw.files_changed {
                        files.insert(f.clone());
                    }
                }
            }
            bundle.files_touched = files.into_iter().collect();

            let additions: u64 = raw_commits
                .iter()
                .filter(|c| candidate.commits.iter().any(|cr| cr.sha == c.sha))
                .map(|c| c.additions)
                .sum();
            let deletions: u64 = raw_commits
                .iter()
                .filter(|c| candidate.commits.iter().any(|cr| cr.sha == c.sha))
                .map(|c| c.deletions)
                .sum();
            bundle.stats.additions = additions;
            bundle.stats.deletions = deletions;

            upsert_bundle(&bundle)?;
            created += 1;
        }
    }

    // Handle unsorted commits: add to the branch's "Unsorted" bundle
    let unsorted_candidates: Vec<_> = candidates
        .iter()
        .filter(|c| c.commits.len() <= 1 && c.confidence < 0.6)
        .collect();

    if !unsorted_candidates.is_empty() {
        let mut unsorted = unsorted_bundle(branch)?;
        let mut changed = false;
        for candidate in &unsorted_candidates {
            for commit in &candidate.commits {
                if !unsorted.has_commit(&commit.sha) && !placed_shas.contains(&commit.sha) {
                    unsorted.add_commit(commit.clone());
                    placed_shas.insert(commit.sha.clone());
                    changed = true;
                }
            }
        }
        if changed {
            unsorted.recompute_stats();
            upsert_bundle(&unsorted)?;
        }
    }

    // Update cursor
    update_cursor(branch, &newest_sha)?;

    Ok(ScanResult {
        bundles_created: created,
        bundles_updated: updated,
        commits_processed: raw_commits.len(),
        unsorted_count,
    })
}

/// List bundles with optional filters.
pub fn list_bundles(
    branch: Option<&str>,
    kind: Option<BundleKind>,
    status: Option<BundleStatus>,
) -> Result<Vec<Bundle>> {
    let mut bundles = load_all_bundles()?;

    if let Some(b) = branch {
        bundles.retain(|bund| bund.branch == b);
    }
    if let Some(k) = kind {
        bundles.retain(|bund| bund.kind == k);
    }
    if let Some(s) = status {
        bundles.retain(|bund| bund.status == s);
    }

    // Sort by created_at descending (newest first)
    bundles.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(bundles)
}

/// Get a single bundle by ID.
pub fn get_bundle(id: &str) -> Result<Option<Bundle>> {
    store::load_bundle(id)
}

/// Rename a bundle.
pub fn rename_bundle(id: &str, new_title: &str) -> Result<()> {
    let mut bundle = store::load_bundle(id)?
        .with_context(|| format!("bundle '{}' not found", id))?;
    bundle.title = new_title.to_string();
    bundle.source = BundleSource::Human;
    upsert_bundle(&bundle)
}

/// Merge bundle `a` into bundle `b`. Bundle `a` is deleted after merge.
pub fn merge_bundles(a_id: &str, b_id: &str) -> Result<()> {
    let mut a = store::load_bundle(a_id)?
        .with_context(|| format!("bundle '{}' not found", a_id))?;
    let mut b = store::load_bundle(b_id)?
        .with_context(|| format!("bundle '{}' not found", b_id))?;

    if a.is_sealed() {
        anyhow::bail!("bundle '{}' is sealed and cannot be modified", a_id);
    }
    if b.is_sealed() {
        anyhow::bail!("bundle '{}' is sealed and cannot be modified", b_id);
    }

    // Move all commits from a to b
    for commit in &a.commits {
        if !b.has_commit(&commit.sha) {
            b.add_commit(commit.clone());
        }
    }

    // Merge files_touched
    let mut files: std::collections::HashSet<String> =
        b.files_touched.iter().cloned().collect();
    for f in &a.files_touched {
        files.insert(f.clone());
    }
    b.files_touched = files.into_iter().collect();

    // Recompute kind if mixed
    if a.kind != b.kind {
        b.kind = BundleKind::Mixed;
    }

    // Recompute stats
    b.recompute_stats();
    b.source = BundleSource::Human;

    upsert_bundle(&b)?;
    remove_bundle(a_id)?;

    Ok(())
}

/// Split a bundle at a given SHA. Commits before the SHA stay in the original
/// bundle; commits from the SHA onward go into a new bundle.
pub fn split_bundle(id: &str, split_sha: &str) -> Result<String> {
    let bundle = store::load_bundle(id)?
        .with_context(|| format!("bundle '{}' not found", id))?;

    if bundle.is_sealed() {
        anyhow::bail!("bundle '{}' is sealed and cannot be modified", id);
    }

    if !bundle.has_commit(split_sha) {
        anyhow::bail!(
            "SHA '{}' not found in bundle '{}'",
            split_sha,
            id
        );
    }

    // Find the split position
    let split_pos = bundle
        .commits
        .iter()
        .position(|c| c.sha == split_sha)
        .unwrap();

    let before: Vec<_> = bundle.commits[..split_pos].to_vec();
    let after: Vec<_> = bundle.commits[split_pos..].to_vec();

    // Update original bundle with "before" commits
    let mut original = bundle.clone();
    original.commits = before;
    original.recompute_stats();
    upsert_bundle(&original)?;

    // Create new bundle with "after" commits
    let new_id = format!("{}-split", id);
    let mut new_bundle = Bundle::new(&new_id, format!("{} (cont.)", bundle.title), &bundle.branch);
    new_bundle.kind = bundle.kind;
    new_bundle.confidence = bundle.confidence;
    new_bundle.card_id = bundle.card_id.clone();
    new_bundle.source = BundleSource::Human;
    new_bundle.commits = after;
    new_bundle.recompute_stats();
    upsert_bundle(&new_bundle)?;

    Ok(new_id)
}

/// Move a commit from one bundle to another.
pub fn move_commit(sha: &str, from_id: &str, to_id: &str) -> Result<()> {
    let mut from = store::load_bundle(from_id)?
        .with_context(|| format!("bundle '{}' not found", from_id))?;
    let mut to = store::load_bundle(to_id)?
        .with_context(|| format!("bundle '{}' not found", to_id))?;

    if from.is_sealed() {
        anyhow::bail!("bundle '{}' is sealed and cannot be modified", from_id);
    }
    if to.is_sealed() {
        anyhow::bail!("bundle '{}' is sealed and cannot be modified", to_id);
    }

    let commit = from
        .remove_commit(sha)
        .with_context(|| format!("SHA '{}' not found in bundle '{}'", sha, from_id))?;

    to.add_commit(commit);
    upsert_bundle(&from)?;
    upsert_bundle(&to)?;

    Ok(())
}

/// Seal a bundle (marks it immutable).
pub fn seal_bundle(id: &str) -> Result<()> {
    let mut bundle = store::load_bundle(id)?
        .with_context(|| format!("bundle '{}' not found", id))?;
    bundle.seal();
    upsert_bundle(&bundle)
}

/// Approve a bundle (human gate).
pub fn approve_bundle(id: &str) -> Result<()> {
    let mut bundle = store::load_bundle(id)?
        .with_context(|| format!("bundle '{}' not found", id))?;
    bundle.source = BundleSource::Human;
    bundle.seal();
    upsert_bundle(&bundle)
}

/// Reject a bundle: remove it and redistribute commits to Unsorted.
pub fn reject_bundle(id: &str, branch: &str) -> Result<()> {
    let bundle = store::load_bundle(id)?
        .with_context(|| format!("bundle '{}' not found", id))?;

    // Redistribute commits to unsorted
    let mut unsorted = unsorted_bundle(branch)?;
    for commit in &bundle.commits {
        if !unsorted.has_commit(&commit.sha) {
            unsorted.add_commit(commit.clone());
        }
    }
    unsorted.recompute_stats();
    upsert_bundle(&unsorted)?;

    remove_bundle(id)?;
    Ok(())
}

/// Show bundle tree (epic → bundle → commits).
pub fn bundle_tree() -> Result<String> {
    let bundles = load_all_bundles()?;
    let mut lines = Vec::new();

    // Group by branch
    let mut by_branch: std::collections::HashMap<String, Vec<&Bundle>> =
        std::collections::HashMap::new();
    for b in &bundles {
        by_branch.entry(b.branch.clone()).or_default().push(b);
    }

    for (branch, branch_bundles) in by_branch {
        lines.push(format!("{}:", branch));
        for b in branch_bundles {
            let status = if b.is_sealed() { "sealed" } else { "open" };
            lines.push(format!(
                "  [{}] {} ({}, {} commits, {:.0}%)",
                status,
                b.title,
                b.kind.as_str(),
                b.stats.commits,
                b.confidence * 100.0
            ));
            for c in &b.commits {
                lines.push(format!("    {} {}", &c.sha[..8.min(c.sha.len())], c.subject));
            }
        }
        lines.push(String::new());
    }

    Ok(lines.join("\n"))
}

/// Validate all bundles against the current git state.
pub fn validate(root: &Path) -> Vec<String> {
    let bundles = load_all_bundles().unwrap_or_default();
    store::validate_bundles(root, &bundles)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_config_default() {
        let config = ScanConfig::default();
        assert_eq!(config.branch, "HEAD");
        assert!(config.use_llm);
        assert_eq!(config.max_commits, git::DEFAULT_MAX_COMMITS);
    }
}
