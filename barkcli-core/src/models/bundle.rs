use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Bundle kind classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BundleKind {
    Feat,
    Fix,
    Refactor,
    Docs,
    Chore,
    Test,
    Mixed,
}

impl BundleKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            BundleKind::Feat => "feat",
            BundleKind::Fix => "fix",
            BundleKind::Refactor => "refactor",
            BundleKind::Docs => "docs",
            BundleKind::Chore => "chore",
            BundleKind::Test => "test",
            BundleKind::Mixed => "mixed",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "feat" | "feature" => Some(BundleKind::Feat),
            "fix" => Some(BundleKind::Fix),
            "refactor" => Some(BundleKind::Refactor),
            "docs" | "doc" => Some(BundleKind::Docs),
            "chore" => Some(BundleKind::Chore),
            "test" | "tests" => Some(BundleKind::Test),
            "mixed" => Some(BundleKind::Mixed),
            _ => None,
        }
    }

    /// Classify from a set of conventional-commit type strings.
    pub fn from_commit_types(types: &[String]) -> Self {
        if types.is_empty() {
            return BundleKind::Mixed;
        }
        let total = types.len();
        let counts: std::collections::HashMap<String, usize> = types.iter().fold(
            std::collections::HashMap::new(),
            |mut acc, t| {
                *acc.entry(t.clone()).or_insert(0) += 1;
                acc
            },
        );
        let (dominant, count) = counts
            .into_iter()
            .max_by_key(|(_, c)| *c)
            .unwrap_or_default();
        if count * 2 > total {
            Self::parse(&dominant).unwrap_or(BundleKind::Mixed)
        } else {
            BundleKind::Mixed
        }
    }
}

impl std::fmt::Display for BundleKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Bundle lifecycle status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BundleStatus {
    Open,
    Sealed,
}

impl BundleStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            BundleStatus::Open => "open",
            BundleStatus::Sealed => "sealed",
        }
    }
}

/// Where the bundle came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BundleSource {
    Heuristic,
    Llm,
    Human,
}

impl BundleSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            BundleSource::Heuristic => "heuristic",
            BundleSource::Llm => "llm",
            BundleSource::Human => "human",
        }
    }
}

/// A reference to a single git commit within a bundle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitRef {
    pub sha: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch_id: Option<String>,
    pub subject: String,
    pub author: String,
    pub date: DateTime<Utc>,
}

/// SHA range covered by a bundle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitRange {
    pub first_sha: String,
    pub last_sha: String,
}

/// Aggregate statistics for a bundle.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BundleStats {
    pub commits: usize,
    pub additions: u64,
    pub deletions: u64,
}

/// A Smart History Bundle — groups related git commits into a named unit.
///
/// Bundles are a **metadata overlay** on top of git history. They NEVER
/// modify, rewrite, or curate git history directly. All git operations are
/// read-only; any history-curating export creates a new branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bundle {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub summary: String,
    #[serde(default = "default_kind")]
    pub kind: BundleKind,
    #[serde(default = "default_status")]
    pub status: BundleStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spec_id: Option<String>,
    pub branch: String,
    #[serde(default)]
    pub commits: Vec<CommitRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<CommitRange>,
    #[serde(default)]
    pub files_touched: Vec<String>,
    #[serde(default)]
    pub stats: BundleStats,
    #[serde(default = "default_confidence")]
    pub confidence: f64,
    #[serde(default = "default_now")]
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sealed_at: Option<DateTime<Utc>>,
    #[serde(default = "default_source")]
    pub source: BundleSource,
    /// Schema version for forward compatibility.
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
}

impl Default for Bundle {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: String::new(),
            summary: String::new(),
            kind: BundleKind::Mixed,
            status: BundleStatus::Open,
            parent_id: None,
            card_id: None,
            spec_id: None,
            branch: String::new(),
            commits: Vec::new(),
            range: None,
            files_touched: Vec::new(),
            stats: BundleStats::default(),
            confidence: 0.0,
            created_at: Utc::now(),
            sealed_at: None,
            source: BundleSource::Heuristic,
            schema_version: 1,
        }
    }
}

impl Bundle {
    pub fn new(id: impl Into<String>, title: impl Into<String>, branch: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            branch: branch.into(),
            ..Default::default()
        }
    }

    /// Recompute stats from commits and files_touched.
    pub fn recompute_stats(&mut self) {
        self.stats.commits = self.commits.len();
        self.range = if self.commits.is_empty() {
            None
        } else {
            Some(CommitRange {
                first_sha: self.commits.first().unwrap().sha.clone(),
                last_sha: self.commits.last().unwrap().sha.clone(),
            })
        };
    }

    /// Check if a commit SHA is in this bundle.
    pub fn has_commit(&self, sha: &str) -> bool {
        self.commits.iter().any(|c| c.sha == sha)
    }

    /// Add a commit to the bundle, keeping chronological order (oldest first).
    pub fn add_commit(&mut self, commit: CommitRef) {
        // Insert maintaining chronological order (oldest first)
        let pos = self
            .commits
            .binary_search_by(|c| c.date.cmp(&commit.date))
            .unwrap_or_else(|e| e);
        self.commits.insert(pos, commit);
        self.recompute_stats();
    }

    /// Remove and return a commit by SHA.
    pub fn remove_commit(&mut self, sha: &str) -> Option<CommitRef> {
        let pos = self.commits.iter().position(|c| c.sha == sha)?;
        let removed = self.commits.remove(pos);
        self.recompute_stats();
        Some(removed)
    }

    /// Seal the bundle — marks it immutable.
    pub fn seal(&mut self) {
        if self.status == BundleStatus::Open {
            self.status = BundleStatus::Sealed;
            self.sealed_at = Some(Utc::now());
        }
    }

    /// Returns true if the bundle is sealed (immutable).
    pub fn is_sealed(&self) -> bool {
        self.status == BundleStatus::Sealed
    }
}

fn default_kind() -> BundleKind {
    BundleKind::Mixed
}

fn default_status() -> BundleStatus {
    BundleStatus::Open
}

fn default_confidence() -> f64 {
    0.0
}

fn default_now() -> DateTime<Utc> {
    Utc::now()
}

fn default_source() -> BundleSource {
    BundleSource::Heuristic
}

fn default_schema_version() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(sha: &str, subject: &str, date: &str) -> CommitRef {
        CommitRef {
            sha: sha.into(),
            patch_id: None,
            subject: subject.into(),
            author: "test".into(),
            date: date.parse::<DateTime<Utc>>().unwrap(),
        }
    }

    #[test]
    fn bundle_new_defaults() {
        let b = Bundle::new("my-bundle", "My Bundle", "main");
        assert_eq!(b.id, "my-bundle");
        assert_eq!(b.title, "My Bundle");
        assert_eq!(b.branch, "main");
        assert_eq!(b.status, BundleStatus::Open);
        assert_eq!(b.kind, BundleKind::Mixed);
        assert_eq!(b.schema_version, 1);
    }

    #[test]
    fn add_commit_maintains_order() {
        let mut b = Bundle::new("test", "Test", "main");
        b.add_commit(commit("c3", "third", "2024-01-03T00:00:00Z"));
        b.add_commit(commit("c1", "first", "2024-01-01T00:00:00Z"));
        b.add_commit(commit("c2", "second", "2024-01-02T00:00:00Z"));
        assert_eq!(b.commits.len(), 3);
        assert_eq!(b.commits[0].sha, "c1");
        assert_eq!(b.commits[1].sha, "c2");
        assert_eq!(b.commits[2].sha, "c3");
        assert_eq!(b.stats.commits, 3);
        assert!(b.range.is_some());
        assert_eq!(b.range.as_ref().unwrap().first_sha, "c1");
        assert_eq!(b.range.as_ref().unwrap().last_sha, "c3");
    }

    #[test]
    fn remove_commit_works() {
        let mut b = Bundle::new("test", "Test", "main");
        b.add_commit(commit("c1", "first", "2024-01-01T00:00:00Z"));
        b.add_commit(commit("c2", "second", "2024-01-02T00:00:00Z"));
        let removed = b.remove_commit("c1");
        assert!(removed.is_some());
        assert_eq!(b.commits.len(), 1);
        assert_eq!(b.commits[0].sha, "c2");
    }

    #[test]
    fn seal_marks_immutable() {
        let mut b = Bundle::new("test", "Test", "main");
        assert!(!b.is_sealed());
        b.seal();
        assert!(b.is_sealed());
        assert!(b.sealed_at.is_some());
    }

    #[test]
    fn kind_from_commit_types() {
        assert_eq!(
            BundleKind::from_commit_types(&["feat".into(), "feat".into(), "fix".into()]),
            BundleKind::Feat
        );
        assert_eq!(
            BundleKind::from_commit_types(&[]),
            BundleKind::Mixed
        );
        assert_eq!(
            BundleKind::from_commit_types(&["fix".into()]),
            BundleKind::Fix
        );
    }

    #[test]
    fn kind_parse() {
        assert_eq!(BundleKind::parse("feat"), Some(BundleKind::Feat));
        assert_eq!(BundleKind::parse("feature"), Some(BundleKind::Feat));
        assert_eq!(BundleKind::parse("fix"), Some(BundleKind::Fix));
        assert_eq!(BundleKind::parse("refactor"), Some(BundleKind::Refactor));
        assert_eq!(BundleKind::parse("docs"), Some(BundleKind::Docs));
        assert_eq!(BundleKind::parse("chore"), Some(BundleKind::Chore));
        assert_eq!(BundleKind::parse("test"), Some(BundleKind::Test));
        assert_eq!(BundleKind::parse("tests"), Some(BundleKind::Test));
        assert_eq!(BundleKind::parse("mixed"), Some(BundleKind::Mixed));
        assert_eq!(BundleKind::parse("unknown"), None);
    }
}
