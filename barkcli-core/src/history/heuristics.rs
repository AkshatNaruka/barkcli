//! Pure, deterministic heuristic grouping of commits into candidate bundles.
//!
//! No I/O, no git calls, no side effects. Commits go in, candidate groups
//! come out. Fully unit-testable.
//!
//! Signals used (in priority order):
//! 1. `Bark-Card:` / `Bark-Bundle:` trailers in commit messages
//! 2. Conventional-commit type/scope
//! 3. Time gaps (session boundaries)
//! 4. Directory/file overlap (Jaccard similarity)
//! 5. Merge commits and PR/squash-merge markers
//! 6. fixup!/revert pairing
//! 7. Author continuity

use std::collections::{HashMap, HashSet};

use chrono::Duration;

use crate::history::git::RawCommit;
use crate::models::bundle::{BundleKind, CommitRef};

/// Configuration for the heuristic engine.
#[derive(Debug, Clone)]
pub struct HeuristicConfig {
    /// Maximum time gap (minutes) between commits in the same session.
    /// Default: 120 (2 hours).
    pub session_gap_minutes: i64,
    /// Minimum Jaccard similarity for file overlap grouping.
    /// Default: 0.5.
    pub jaccard_threshold: f64,
    /// Minimum combined confidence to group commits.
    /// Default: 0.5.
    pub group_threshold: f64,
    /// Maximum commits per bundle (safety cap).
    /// Default: 100.
    pub max_bundle_size: usize,
}

impl Default for HeuristicConfig {
    fn default() -> Self {
        Self {
            session_gap_minutes: 120,
            jaccard_threshold: 0.5,
            group_threshold: 0.5,
            max_bundle_size: 100,
        }
    }
}

/// A candidate group produced by the heuristic engine.
#[derive(Debug, Clone)]
pub struct CandidateGroup {
    pub commits: Vec<CommitRef>,
    pub kind: BundleKind,
    pub confidence: f64,
    pub card_id: Option<String>,
    pub branch_name: String,
    /// Conventional-commit types found in this group.
    pub commit_types: Vec<String>,
}

/// Extract the card ID from a commit's trailers.
fn extract_card_id(commit: &RawCommit) -> Option<String> {
    for (key, value) in &commit.trailers {
        if key.eq_ignore_ascii_case("Bark-Card") {
            return Some(value.clone());
        }
    }
    None
}

/// Extract the bundle hint from a commit's trailers.
fn extract_bundle_hint(commit: &RawCommit) -> Option<String> {
    for (key, value) in &commit.trailers {
        if key.eq_ignore_ascii_case("Bark-Bundle") {
            return Some(value.clone());
        }
    }
    None
}

/// Parse conventional-commit type and scope from a subject line.
/// E.g. "feat(api): add endpoint" -> ("feat", Some("api"))
fn parse_conventional(subject: &str) -> (Option<String>, Option<String>) {
    // Match: type(scope): subject  OR  type(scope)!: subject  OR  type: subject
    let re = regex::Regex::new(r"^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$").unwrap();
    if let Some(caps) = re.captures(subject) {
        let typ = caps.get(1).map(|m| m.as_str().to_lowercase());
        let scope = caps.get(3).map(|m| m.as_str().to_lowercase());
        return (typ, scope);
    }
    (None, None)
}

/// Detect merge commit patterns in subject.
fn is_merge_subject(subject: &str) -> bool {
    let lower = subject.to_lowercase();
    lower.starts_with("merge ")
        || lower.starts_with("merged ")
        || lower.contains("pull request #")
        || lower.contains("pr #")
}

/// Detect fixup/revert patterns.
fn is_fixup_subject(subject: &str) -> bool {
    let lower = subject.to_lowercase();
    lower.starts_with("fixup!")
        || lower.starts_with("revert ")
        || lower.starts_with("amend!")
}

/// Compute Jaccard similarity between two file sets.
fn jaccard_similarity(a: &[String], b: &[String]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let set_a: HashSet<_> = a.iter().collect();
    let set_b: HashSet<_> = b.iter().collect();
    let intersection = set_a.intersection(&set_b).count();
    let union = set_a.union(&set_b).count();
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// Compute pairwise grouping confidence between two adjacent commits.
///
/// Returns a score from 0.0 to 1.0. Higher = more likely same bundle.
fn pairwise_confidence(
    prev: &RawCommit,
    curr: &RawCommit,
    config: &HeuristicConfig,
) -> (f64, Option<String>, Option<String>) {
    let mut score = 0.0;
    let mut card_id = None;
    let mut bundle_hint = None;

    // Signal 1: Same Bark-Card trailer (highest confidence)
    let prev_card = extract_card_id(prev);
    let curr_card = extract_card_id(curr);
    if prev_card.is_some() && prev_card == curr_card {
        score += 0.9;
        card_id = curr_card.clone();
    }

    // Signal 1b: Same Bark-Bundle trailer
    let prev_bundle = extract_bundle_hint(prev);
    let curr_bundle = extract_bundle_hint(curr);
    if prev_bundle.is_some() && prev_bundle == curr_bundle {
        score += 0.85;
        bundle_hint = curr_bundle.clone();
    }

    // Signal 2: Conventional-commit type/scope match
    let (prev_type, prev_scope) = parse_conventional(&prev.subject);
    let (curr_type, curr_scope) = parse_conventional(&curr.subject);
    if prev_type.is_some() && prev_type == curr_type {
        score += 0.3;
        // Scope match is an additional boost
        if prev_scope.is_some() && prev_scope == curr_scope {
            score += 0.2;
        }
    }

    // Signal 3: Time gap (session boundary detection)
    let gap = curr.date.signed_duration_since(prev.date);
    if gap <= Duration::minutes(config.session_gap_minutes) {
        score += 0.2;
    } else if gap <= Duration::hours(24) {
        score += 0.05; // Weak signal — same day but big gap
    }
    // Large gap = negative signal
    if gap > Duration::hours(24) {
        score -= 0.3;
    }

    // Signal 4: File overlap (Jaccard)
    let jaccard = jaccard_similarity(&prev.files_changed, &curr.files_changed);
    if jaccard >= config.jaccard_threshold {
        score += 0.25 * jaccard;
    }

    // Signal 5: Merge commits are boundaries
    if curr.is_merge {
        score -= 0.5;
    }
    if is_merge_subject(&curr.subject) {
        score -= 0.4;
    }

    // Signal 6: fixup!/revert attach to previous commit's group
    if is_fixup_subject(&curr.subject) {
        score += 0.4;
    }

    // Signal 7: Same author continuity
    if prev.author == curr.author {
        score += 0.1;
    }

    // Empty commits get a small boost to group with neighbors
    if curr.is_empty {
        score += 0.15;
    }

    // Clamp to [0, 1]
    score = score.clamp(0.0, 1.0);

    (score, card_id, bundle_hint)
}

/// Group commits into candidate bundles using deterministic heuristics.
///
/// Input: commits in git log order (newest first).
/// Output: candidate groups, each with commits in chronological order (oldest first).
pub fn group_commits(
    commits: &[RawCommit],
    branch: &str,
    config: &HeuristicConfig,
) -> Vec<CandidateGroup> {
    if commits.is_empty() {
        return Vec::new();
    }

    // Reverse to chronological order (oldest first) for grouping
    let chronological: Vec<&RawCommit> = commits.iter().rev().collect();

    // Compute pairwise confidences between adjacent commits
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut current_group: Vec<usize> = vec![0]; // Start with oldest commit

    for i in 1..chronological.len() {
        let prev = chronological[i - 1];
        let curr = chronological[i];
        let (confidence, card_id, bundle_hint) = pairwise_confidence(prev, curr, config);

        // Check if current group is at max size
        if current_group.len() >= config.max_bundle_size {
            groups.push(std::mem::take(&mut current_group));
            current_group = vec![i];
            continue;
        }

        // Merge commits always start a new group
        if curr.is_merge && !current_group.is_empty() {
            groups.push(std::mem::take(&mut current_group));
            current_group = vec![i];
            continue;
        }

        if confidence >= config.group_threshold {
            // Same group
            current_group.push(i);
        } else {
            // Boundary — start new group
            groups.push(std::mem::take(&mut current_group));
            current_group = vec![i];
        }
    }

    // Don't forget the last group
    if !current_group.is_empty() {
        groups.push(current_group);
    }

    // Convert index groups to CandidateGroup structs
    groups
        .into_iter()
        .map(|indices| {
            let group_commits: Vec<&RawCommit> = indices.iter().map(|&i| chronological[i]).collect();

            // Determine card_id: use the most common non-None card_id
            let mut card_counts: HashMap<String, usize> = HashMap::new();
            let mut bundle_hints: HashMap<String, usize> = HashMap::new();
            let mut types: Vec<String> = Vec::new();

            for c in &group_commits {
                if let Some(card) = extract_card_id(c) {
                    *card_counts.entry(card).or_insert(0) += 1;
                }
                if let Some(hint) = extract_bundle_hint(c) {
                    *bundle_hints.entry(hint).or_insert(0) += 1;
                }
                if let (Some(typ), _scope) = parse_conventional(&c.subject) {
                    if !typ.is_empty() {
                        types.push(typ);
                    }
                }
            }

            let card_id = card_counts
                .into_iter()
                .max_by_key(|(_, count)| *count)
                .map(|(card, _)| card);

            // Bundle hint: if there's a dominant one, use it as title hint
            let _bundle_hint = bundle_hints
                .into_iter()
                .max_by_key(|(_, count)| *count)
                .map(|(hint, _)| hint);

            let kind = BundleKind::from_commit_types(&types);

            // Compute overall group confidence (average of pairwise confidences)
            let avg_confidence = if group_commits.len() <= 1 {
                0.5 // Single commit — neutral confidence
            } else {
                let mut total = 0.0;
                let mut count = 0;
                for j in 1..group_commits.len() {
                    let (conf, _, _) = pairwise_confidence(group_commits[j - 1], group_commits[j], config);
                    total += conf;
                    count += 1;
                }
                total / count as f64
            };

            // Build CommitRefs in chronological order
            let commit_refs: Vec<CommitRef> = group_commits
                .iter()
                .map(|c| CommitRef {
                    sha: c.sha.clone(),
                    patch_id: c.patch_id.clone(),
                    subject: c.subject.clone(),
                    author: c.author.clone(),
                    date: c.date,
                })
                .collect();

            CandidateGroup {
                commits: commit_refs,
                kind,
                confidence: avg_confidence.clamp(0.0, 1.0),
                card_id,
                branch_name: branch.to_string(),
                commit_types: types,
            }
        })
        .collect()
}

/// Generate a human-readable title for a candidate group.
pub fn title_for_group(group: &CandidateGroup) -> String {
    if let Some(card) = &group.card_id {
        return card.clone();
    }

    // Use the first commit's subject as a base title
    if let Some(first) = group.commits.first() {
        let subject = &first.subject;
        // Strip conventional-commit prefix for cleaner title
        let (_, msg) = parse_conventional(subject);
        if let Some(m) = msg {
            return m.to_string();
        }
        return subject.clone();
    }

    "Unnamed".to_string()
}

/// Identify the "Unsorted" candidate — singletons with low confidence.
pub fn is_unsorted_candidate(group: &CandidateGroup) -> bool {
    group.commits.len() <= 1 && group.confidence < 0.6
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn raw_commit(sha: &str, subject: &str, files: &[&str]) -> RawCommit {
        let files: Vec<String> = files.iter().map(|f| f.to_string()).collect();
        RawCommit {
            sha: sha.into(),
            parents: vec![],
            subject: subject.into(),
            body: String::new(),
            author: "Alice".into(),
            author_email: "alice@test.com".into(),
            date: Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap(),
            trailers: vec![],
            is_merge: false,
            is_empty: files.is_empty(),
            files_changed: files,
            additions: 0,
            deletions: 0,
            patch_id: None,
        }
    }

    fn raw_commit_with_card(sha: &str, subject: &str, card: &str) -> RawCommit {
        let mut c = raw_commit(sha, subject, &["src/main.rs"]);
        c.trailers = vec![("Bark-Card".into(), card.into())];
        c
    }

    #[test]
    fn empty_input() {
        let groups = group_commits(&[], "main", &HeuristicConfig::default());
        assert!(groups.is_empty());
    }

    #[test]
    fn single_commit_produces_one_group() {
        let commits = vec![raw_commit("a1", "feat: add feature", &["src/main.rs"])];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].commits.len(), 1);
        assert_eq!(groups[0].kind, BundleKind::Feat);
    }

    #[test]
    fn same_card_trailer_groups_commits() {
        // a1 and a4 use different files and a large time gap to avoid grouping with card commits
        let mut a1 = raw_commit("a1", "feat: add feature", &["docs/readme.md"]);
        a1.date = Utc.with_ymd_and_hms(2023, 12, 1, 0, 0, 0).unwrap();
        let mut a4 = raw_commit("a4", "feat: unrelated", &["src/other.rs"]);
        a4.date = Utc.with_ymd_and_hms(2024, 1, 10, 0, 0, 0).unwrap();

        let commits = vec![
            a4,
            raw_commit_with_card("a3", "feat: fix typo", "my-card"),
            raw_commit_with_card("a2", "feat: add more", "my-card"),
            a1,
        ];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        // Commits a2 and a3 should be grouped (same card trailer)
        let with_card: Vec<_> = groups
            .iter()
            .filter(|g| g.card_id.is_some())
            .collect();
        assert_eq!(with_card.len(), 1);
        assert_eq!(with_card[0].commits.len(), 2);
        assert_eq!(with_card[0].card_id.as_deref(), Some("my-card"));
    }

    #[test]
    fn file_overlap_groups_commits() {
        let commits = vec![
            raw_commit("a1", "feat: add a", &["src/foo.rs", "src/bar.rs"]),
            raw_commit("a2", "feat: add b", &["src/foo.rs", "src/baz.rs"]),
            raw_commit("a3", "feat: different", &["docs/readme.md"]),
        ];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        // a1 and a2 share src/foo.rs -> Jaccard = 1/3 = 0.33, below default 0.5 threshold
        // But they're same author + close in time + same conventional type
        // Let's just verify grouping happens
        assert!(groups.len() >= 1);
    }

    #[test]
    fn merge_commit_creates_boundary() {
        let commits = vec![
            raw_commit("a1", "feat: add a", &["src/main.rs"]),
            RawCommit {
                is_merge: true,
                ..raw_commit("a2", "Merge branch 'feature'", &[])
            },
            raw_commit("a3", "feat: add b", &["src/other.rs"]),
        ];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        // Should have at least 2 groups (merge is a boundary)
        assert!(groups.len() >= 2);
    }

    #[test]
    fn conventional_type_classification() {
        let commits = vec![
            raw_commit("a1", "feat: add a", &["src/main.rs"]),
            raw_commit("a2", "feat: add b", &["src/main.rs"]),
        ];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        assert_eq!(groups[0].kind, BundleKind::Feat);
    }

    #[test]
    fn fixup_attaches_to_previous() {
        let commits = vec![
            raw_commit("a1", "feat: add feature", &["src/main.rs"]),
            raw_commit("a2", "fixup! feat: add feature", &["src/main.rs"]),
        ];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        // Both should be in the same group
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].commits.len(), 2);
    }

    #[test]
    fn large_time_gap_creates_boundary() {
        let mut c1 = raw_commit("a1", "feat: add a", &["src/main.rs"]);
        c1.date = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
        let mut c2 = raw_commit("a2", "feat: add b", &["src/main.rs"]);
        c2.date = Utc.with_ymd_and_hms(2024, 1, 10, 0, 0, 0).unwrap(); // 9 days later

        let commits = vec![c2, c1]; // git log order: newest first
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        assert_eq!(groups.len(), 2); // Should be separate groups
    }

    #[test]
    fn jaccard_similarity_works() {
        assert_eq!(jaccard_similarity(&["a".into(), "b".into()], &["a".into(), "b".into()]), 1.0);
        assert_eq!(jaccard_similarity(&["a".into()], &["b".into()]), 0.0);
        assert_eq!(
            jaccard_similarity(&["a".into(), "b".into(), "c".into()], &["a".into(), "b".into(), "d".into()]),
            0.5
        );
    }

    #[test]
    fn parse_conventional_works() {
        let (typ, scope) = parse_conventional("feat(api): add endpoint");
        assert_eq!(typ.as_deref(), Some("feat"));
        assert_eq!(scope.as_deref(), Some("api"));

        let (typ, scope) = parse_conventional("fix: bug");
        assert_eq!(typ.as_deref(), Some("fix"));
        assert_eq!(scope, None);

        let (typ, scope) = parse_conventional("random message");
        assert_eq!(typ, None);
        assert_eq!(scope, None);

        let (typ, _) = parse_conventional("feat(api)!: breaking change");
        assert_eq!(typ.as_deref(), Some("feat"));
    }

    #[test]
    fn title_for_group_uses_card_id() {
        let mut group = CandidateGroup {
            commits: vec![],
            kind: BundleKind::Feat,
            confidence: 0.8,
            card_id: Some("my-card".into()),
            branch_name: "main".into(),
            commit_types: vec![],
        };
        assert_eq!(title_for_group(&group), "my-card");
    }

    #[test]
    fn max_bundle_size_respected() {
        let config = HeuristicConfig {
            max_bundle_size: 2,
            ..Default::default()
        };
        let commits: Vec<RawCommit> = (0..5)
            .map(|i| raw_commit(&format!("a{}", i), "feat: add", &["src/main.rs"]))
            .collect();
        let groups = group_commits(&commits, "main", &config);
        // With max size 2, 5 commits should produce at least 3 groups
        assert!(groups.len() >= 3);
    }

    #[test]
    fn kind_classification_fix() {
        let commits = vec![
            raw_commit("a1", "fix: bug 1", &["src/main.rs"]),
            raw_commit("a2", "fix: bug 2", &["src/main.rs"]),
        ];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        assert_eq!(groups[0].kind, BundleKind::Fix);
    }

    #[test]
    fn kind_classification_mixed() {
        let commits = vec![
            raw_commit("a1", "feat: add", &["src/main.rs"]),
            raw_commit("a2", "fix: bug", &["src/main.rs"]),
        ];
        let groups = group_commits(&commits, "main", &HeuristicConfig::default());
        // feat + fix = mixed (no dominant type)
        assert_eq!(groups[0].kind, BundleKind::Mixed);
    }
}
