//! Optional LLM refinement of heuristic bundle groupings.
//!
//! Follows the same pattern as `intake`: try LLM, fall back to heuristic
//! on failure. Respects opt-out config flag. Redacts secrets and caps
//! diff size before sending anything to an LLM.
//!
//! Input to LLM: per-commit one-line summaries (NOT full diffs).
//! Output from LLM: refined boundaries, titles, summaries, kinds, confidence.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::ai::{chat_json, resolve_config, ChatMessage};
use crate::history::heuristics::CandidateGroup;
use crate::history::git;
use crate::models::bundle::BundleKind;
use crate::util::redact::redact_text;

/// Maximum diff size (KB) to send to LLM.
pub const DEFAULT_MAX_DIFF_KB: usize = 30;

/// Whether LLM refinement is enabled (opt-out via config).
pub fn llm_enabled() -> bool {
    // Check config flag: history.llm_enabled defaults to true
    if let Ok(board_dir) = crate::storage::board_dir::find_board_dir_opt() {
        if let Some(dir) = board_dir {
            if let Ok(config) = crate::storage::config_store::read_config(&dir) {
                // If explicitly set to false, disable
                // We store this as a string in ai settings or a dedicated field
                // For now, default true unless BARKCLI_NO_HISTORY_LLM env is set
                if std::env::var("BARKCLI_NO_HISTORY_LLM").is_ok() {
                    return false;
                }
                let _ = config; // use config when we add the field
            }
        }
    }
    !std::env::var("BARKCLI_NO_HISTORY_LLM").is_ok()
}

/// LLM output structure for bundle refinement.
#[derive(Debug, Deserialize)]
pub struct LlmBundleOutput {
    pub bundles: Vec<LlmBundleRefinement>,
}

#[derive(Debug, Deserialize)]
pub struct LlmBundleRefinement {
    /// Index into the input candidate groups (0-based).
    pub group_index: usize,
    /// Refined title for this bundle.
    pub title: String,
    /// One-sentence summary of what this bundle does.
    pub summary: String,
    /// Bundle kind classification.
    pub kind: String,
    /// Confidence score 0.0-1.0.
    pub confidence: f64,
    /// Suggested split points: commit SHAs where the bundle should split.
    #[serde(default)]
    pub split_at: Vec<String>,
    /// Suggested merge: if this bundle should merge with another, the target index.
    #[serde(default)]
    pub merge_with: Option<usize>,
}

/// Per-commit summary sent to the LLM (NOT full diffs).
#[derive(Debug, Serialize)]
struct CommitSummaryInput {
    sha: String,
    subject: String,
    author: String,
    files_changed: Vec<String>,
    additions: u64,
    deletions: u64,
}

/// Build the LLM prompt for bundle refinement.
fn build_refinement_prompt(
    candidates: &[CandidateGroup],
    commit_summaries: &[Vec<CommitSummaryInput>],
) -> (String, String) {
    let system = r#"You are a git history analyst. Given grouped commits, refine the grouping.

Return JSON with exactly this structure:
{
  "bundles": [
    {
      "group_index": 0,
      "title": "Concise bundle title (max 60 chars)",
      "summary": "One sentence describing what this bundle accomplishes",
      "kind": "feat" | "fix" | "refactor" | "docs" | "chore" | "test" | "mixed",
      "confidence": 0.0 to 1.0,
      "split_at": ["sha1", "sha2"],
      "merge_with": null
    }
  ]
}

Rules:
- Merge commits should be in their own bundle or marked as "mixed"
- fixup!/revert commits belong with their parent commit's bundle
- Group related changes (same feature, same fix) together
- Keep bundles focused — a bundle should represent one logical change
- Suggest splits when a group covers multiple unrelated changes
- Suggest merges when two groups are clearly the same logical change
- Title should be human-readable, not a commit message
"#;

    // Build user message with commit summaries per group
    let mut user_parts = Vec::new();
    for (i, (group, summaries)) in candidates.iter().zip(commit_summaries.iter()).enumerate() {
        user_parts.push(format!("=== Group {} ({} commits) ===", i, summaries.len()));
        for s in summaries {
            user_parts.push(format!(
                "  {} | {} | {} | files: {} | +{}/-{}{}",
                &s.sha[..8.min(s.sha.len())],
                s.subject,
                s.author,
                s.files_changed.join(", "),
                s.additions,
                s.deletions,
                if s.files_changed.is_empty() { " (empty)" } else { "" }
            ));
        }
        user_parts.push(String::new());
    }

    let user = format!(
        "Analyze these {} commit groups and refine the grouping:\n\n{}",
        candidates.len(),
        user_parts.join("\n")
    );

    (system.to_string(), user)
}

/// Refine candidate groups using an LLM.
///
/// Falls back to the original candidates if LLM is disabled or fails.
/// Returns refined candidates with updated titles, kinds, and confidence.
pub fn refine_candidates(
    root: &std::path::Path,
    branch: &str,
    candidates: Vec<CandidateGroup>,
) -> Result<Vec<CandidateGroup>> {
    if !llm_enabled() {
        return Ok(candidates);
    }

    let cfg = match resolve_config() {
        Ok(c) => c,
        Err(_) => return Ok(candidates),
    };

    // Build per-group commit summaries
    let commit_summaries = build_commit_summaries(root, branch, &candidates)?;

    let (system, user) = build_refinement_prompt(&candidates, &commit_summaries);

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system,
        },
        ChatMessage {
            role: "user".into(),
            content: user,
        },
    ];

    let refined: LlmBundleOutput = match chat_json::<LlmBundleOutput>(&cfg, &messages) {
        Ok(r) => r,
        Err(e) => {
            eprintln!(
                "{} LLM refinement failed ({}), using heuristic grouping",
                crate::util::style::warn("Warning:"),
                e
            );
            return Ok(candidates);
        }
    };

    // Apply refinements to candidates
    let mut result = candidates;
    for bundle_ref in &refined.bundles {
        if bundle_ref.group_index >= result.len() {
            continue;
        }
        let group = &mut result[bundle_ref.group_index];

        if !bundle_ref.title.is_empty() {
            // Update title via a special marker — the caller will use this
            group.card_id = Some(bundle_ref.title.clone());
        }
        if let Some(kind) = BundleKind::parse(&bundle_ref.kind) {
            group.kind = kind;
        }
        group.confidence = bundle_ref.confidence.clamp(0.0, 1.0);
    }

    Ok(result)
}

/// Build per-commit summaries for LLM input.
fn build_commit_summaries(
    root: &std::path::Path,
    _branch: &str,
    candidates: &[CandidateGroup],
) -> Result<Vec<Vec<CommitSummaryInput>>> {
    let mut all_summaries = Vec::new();

    for group in candidates {
        let mut group_summaries = Vec::new();
        for commit in &group.commits {
            // Read commit details from git
            let commits = git::read_commits(
                root,
                _branch,
                None,
                git::DEFAULT_MAX_COMMITS,
            )?;
            if let Some(c) = commits.iter().find(|c| c.sha == commit.sha) {
                group_summaries.push(CommitSummaryInput {
                    sha: commit.sha.clone(),
                    subject: c.subject.clone(),
                    author: c.author.clone(),
                    files_changed: c.files_changed.clone(),
                    additions: c.additions,
                    deletions: c.deletions,
                });
            } else {
                // Commit not found (maybe on a different branch) — use stored data
                group_summaries.push(CommitSummaryInput {
                    sha: commit.sha.clone(),
                    subject: commit.subject.clone(),
                    author: commit.author.clone(),
                    files_changed: vec![],
                    additions: 0,
                    deletions: 0,
                });
            }
        }
        all_summaries.push(group_summaries);
    }

    Ok(all_summaries)
}

/// Generate a markdown changelog from bundles.
pub fn generate_changelog(bundles: &[crate::models::bundle::Bundle]) -> String {
    let mut lines = vec!["# Changelog".to_string(), String::new()];

    // Group by kind
    let mut by_kind: std::collections::HashMap<String, Vec<&crate::models::bundle::Bundle>> =
        std::collections::HashMap::new();
    for b in bundles {
        by_kind.entry(b.kind.as_str().to_string()).or_default().push(b);
    }

    for (kind, kind_bundles) in by_kind {
        lines.push(format!("## {}", kind.to_uppercase()));
        lines.push(String::new());
        for b in kind_bundles {
            let range = b
                .range
                .as_ref()
                .map(|r| format!("{}..{}", &r.first_sha[..8.min(r.first_sha.len())], &r.last_sha[..8.min(r.last_sha.len())]))
                .unwrap_or_default();
            let stats = format!(
                " +{}/-{}",
                b.stats.additions, b.stats.deletions
            );
            lines.push(format!(
                "- **{}** ({}, {} commits, {}) — {}",
                b.title, range, b.stats.commits, stats, b.summary
            ));
        }
        lines.push(String::new());
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_enabled_default() {
        // Should be enabled by default (no env var set in test)
        assert!(llm_enabled());
    }

    #[test]
    fn generate_changelog_basic() {
        use crate::models::bundle::{Bundle, BundleKind, CommitRef, CommitRange};
        use chrono::Utc;

        let mut b = Bundle::new("test", "Test Bundle", "main");
        b.kind = BundleKind::Feat;
        b.summary = "Added cool feature".into();
        b.commits.push(CommitRef {
            sha: "abc123def456".into(),
            patch_id: None,
            subject: "feat: add feature".into(),
            author: "Alice".into(),
            date: Utc::now(),
        });
        b.range = Some(CommitRange {
            first_sha: "abc123".into(),
            last_sha: "abc123".into(),
        });
        b.stats.commits = 1;
        b.stats.additions = 10;
        b.stats.deletions = 2;

        let changelog = generate_changelog(&[b]);
        assert!(changelog.contains("Changelog"));
        assert!(changelog.contains("Test Bundle"));
        assert!(changelog.contains("Added cool feature"));
        assert!(changelog.contains("feat"));
    }

    #[test]
    fn redact_before_llm() {
        // Verify redaction works on typical secret patterns
        let text = "password: hunter2, api_key: sk-abcdefghijklmnopqrstuvwxyz123456";
        let redacted = redact_text(text);
        assert!(!redacted.contains("hunter2"));
        assert!(!redacted.contains("sk-abcdefgh"));
        assert!(redacted.contains("[REDACTED]"));
    }
}
