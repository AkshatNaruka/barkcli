//! Trust Layer: risk-ranked review ordering.
//!
//! The score answers one question: *which change should a human read first?*
//! It is deliberately deterministic and explainable. Every point is backed by
//! a [`RiskReason`], so the queue can show its work instead of a black-box
//! number.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::guard::checks::is_documentation;

/// Security-sensitive path fragments. Documentation is excluded before this
/// runs: a security guide that mentions `auth` is not auth code.
static SECURITY_PATH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(auth|session|token|oauth|password|secret|crypto|payment|billing|sql|exec|permission|acl|admin)",
    )
    .expect("security path regex is valid")
});

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskTier {
    Must,
    Should,
    Skim,
    Unknown,
}

impl RiskTier {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Must => "Must",
            Self::Should => "Should",
            Self::Skim => "Skim",
            Self::Unknown => "Unknown",
        }
    }

    /// Higher sorts first. Unknown always sorts last.
    pub fn rank(&self) -> u8 {
        match self {
            Self::Must => 3,
            Self::Should => 2,
            Self::Skim => 1,
            Self::Unknown => 0,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RiskFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub cyclomatic: usize,
    pub touches_public_api: bool,
}

impl RiskFile {
    pub fn lines(&self) -> u32 {
        self.additions.saturating_add(self.deletions)
    }
}

#[derive(Debug, Clone, Default)]
pub struct RiskInput {
    pub files: Vec<RiskFile>,
    /// A non-test, non-documentation file changed.
    pub production_changed: bool,
    /// A test file changed or inline tests were added.
    pub tests_changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RiskReason {
    pub signal: String,
    pub points: u32,
    pub detail: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct RiskAssessment {
    pub score: u32,
    pub tier: RiskTier,
    pub reasons: Vec<RiskReason>,
}

impl Default for RiskTier {
    fn default() -> Self {
        Self::Unknown
    }
}

pub fn tier_for(score: u32) -> RiskTier {
    if score >= 70 {
        RiskTier::Must
    } else if score >= 40 {
        RiskTier::Should
    } else {
        RiskTier::Skim
    }
}

/// Score a candidate diff. Signals and weights are fixed by SPEC-007.
pub fn assess(input: &RiskInput) -> RiskAssessment {
    if input.files.is_empty() {
        return RiskAssessment {
            score: 0,
            tier: RiskTier::Unknown,
            reasons: Vec::new(),
        };
    }

    let mut reasons = Vec::new();

    // Security-sensitive paths — 30.
    let security_paths: Vec<&str> = input
        .files
        .iter()
        .map(|file| file.path.as_str())
        .filter(|path| !is_documentation(path) && SECURITY_PATH.is_match(path))
        .collect();
    if !security_paths.is_empty() {
        reasons.push(RiskReason {
            signal: "security".into(),
            points: 30,
            detail: format!("security-sensitive paths: {}", summarize(&security_paths)),
        });
    }

    // Complexity — 0/10/20 from the highest changed-file cyclomatic score.
    let (complex_path, max_complexity) = input
        .files
        .iter()
        .map(|file| (file.path.as_str(), file.cyclomatic))
        .max_by_key(|(_, complexity)| *complexity)
        .unwrap_or(("", 0));
    let complexity_points = if max_complexity >= 20 {
        20
    } else if max_complexity >= 10 {
        10
    } else {
        0
    };
    if complexity_points > 0 {
        reasons.push(RiskReason {
            signal: "complexity".into(),
            points: complexity_points,
            detail: format!("{complex_path} has cyclomatic complexity {max_complexity}"),
        });
    }

    // Missing tests — 20.
    if input.production_changed && !input.tests_changed {
        reasons.push(RiskReason {
            signal: "missing_tests".into(),
            points: 20,
            detail: "production code changed without test changes".into(),
        });
    }

    // Churn — 0/8/12/15.
    let lines: u32 = input.files.iter().map(RiskFile::lines).sum();
    let churn_points = if lines > 800 {
        15
    } else if lines > 300 {
        12
    } else if lines > 50 {
        8
    } else {
        0
    };
    if churn_points > 0 {
        reasons.push(RiskReason {
            signal: "churn".into(),
            points: churn_points,
            detail: format!("{lines} changed lines"),
        });
    }

    // Public API — 10.
    let api_paths: Vec<&str> = input
        .files
        .iter()
        .filter(|file| file.touches_public_api)
        .map(|file| file.path.as_str())
        .collect();
    if !api_paths.is_empty() {
        reasons.push(RiskReason {
            signal: "public_api".into(),
            points: 10,
            detail: format!("public API changed: {}", summarize(&api_paths)),
        });
    }

    // Size — 0/3/5.
    let size_points = if input.files.len() > 10 {
        5
    } else if input.files.len() > 3 {
        3
    } else {
        0
    };
    if size_points > 0 {
        reasons.push(RiskReason {
            signal: "size".into(),
            points: size_points,
            detail: format!("{} files changed", input.files.len()),
        });
    }

    let score = reasons
        .iter()
        .map(|reason| reason.points)
        .sum::<u32>()
        .min(100);

    RiskAssessment {
        score,
        tier: tier_for(score),
        reasons,
    }
}

fn summarize(paths: &[&str]) -> String {
    const SHOWN: usize = 3;
    let mut text = paths
        .iter()
        .take(SHOWN)
        .copied()
        .collect::<Vec<_>>()
        .join(", ");
    if paths.len() > SHOWN {
        text.push_str(&format!(" (+{} more)", paths.len() - SHOWN));
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, additions: u32, deletions: u32, cyclomatic: usize) -> RiskFile {
        RiskFile {
            path: path.into(),
            additions,
            deletions,
            cyclomatic,
            touches_public_api: false,
        }
    }

    #[test]
    fn clean_small_diff_is_skim() {
        let input = RiskInput {
            files: vec![file("src/app.rs", 10, 2, 3)],
            production_changed: true,
            tests_changed: true,
        };
        let risk = assess(&input);
        assert_eq!(risk.score, 0);
        assert_eq!(risk.tier, RiskTier::Skim);
        assert!(risk.reasons.is_empty());
    }

    #[test]
    fn auth_file_hits_must_tier() {
        let input = RiskInput {
            files: vec![file("src/auth/login.rs", 250, 60, 12)],
            production_changed: true,
            tests_changed: false,
        };
        let risk = assess(&input);
        // security 30 + complexity 10 + missing tests 20 + churn 12 = 72
        assert_eq!(risk.score, 72);
        assert_eq!(risk.tier, RiskTier::Must);
    }

    #[test]
    fn security_dominates_large_docs_diff() {
        let input = RiskInput {
            files: vec![
                file("docs/security/auth.md", 700, 0, 0),
                file("docs/auth/session.md", 500, 0, 0),
            ],
            production_changed: false,
            tests_changed: false,
        };
        let risk = assess(&input);
        // No security points for docs, no missing-tests points.
        assert!(!risk
            .reasons
            .iter()
            .any(|reason| reason.signal == "security"));
        assert!(!risk
            .reasons
            .iter()
            .any(|reason| reason.signal == "missing_tests"));
        // churn 15 + size 0 = 15
        assert_eq!(risk.score, 15);
        assert_eq!(risk.tier, RiskTier::Skim);
    }

    #[test]
    fn missing_tests_adds_twenty() {
        let input = RiskInput {
            files: vec![file("src/lib.rs", 20, 4, 2)],
            production_changed: true,
            tests_changed: false,
        };
        let risk = assess(&input);
        let missing = risk
            .reasons
            .iter()
            .find(|reason| reason.signal == "missing_tests")
            .expect("missing tests reason");
        assert_eq!(missing.points, 20);
        assert_eq!(risk.score, 20);
    }

    #[test]
    fn tier_boundaries() {
        assert_eq!(tier_for(39), RiskTier::Skim);
        assert_eq!(tier_for(40), RiskTier::Should);
        assert_eq!(tier_for(69), RiskTier::Should);
        assert_eq!(tier_for(70), RiskTier::Must);
        assert_eq!(tier_for(100), RiskTier::Must);
    }

    #[test]
    fn reasons_match_points() {
        let mut auth = file("src/payments/charge.rs", 400, 0, 25);
        auth.touches_public_api = true;
        let input = RiskInput {
            files: vec![auth, file("src/a.rs", 1, 1, 1)],
            production_changed: true,
            tests_changed: false,
        };
        let risk = assess(&input);
        let total: u32 = risk.reasons.iter().map(|reason| reason.points).sum();
        assert_eq!(total, risk.score);
        assert!(risk.reasons.iter().all(|reason| reason.points > 0));
        // security 30 + complexity 20 + missing tests 20 + churn 12 + public API 10 = 92
        assert_eq!(risk.score, 92);
        assert_eq!(risk.tier, RiskTier::Must);
    }

    #[test]
    fn no_files_is_unknown() {
        let risk = assess(&RiskInput::default());
        assert_eq!(risk.score, 0);
        assert_eq!(risk.tier, RiskTier::Unknown);
        assert!(risk.reasons.is_empty());
    }

    #[test]
    fn score_is_capped_at_one_hundred() {
        let mut files: Vec<RiskFile> = (0..12)
            .map(|i| file(&format!("src/auth/{i}.rs"), 200, 100, 25))
            .collect();
        for file in &mut files {
            file.touches_public_api = true;
        }
        let risk = assess(&RiskInput {
            files,
            production_changed: true,
            tests_changed: false,
        });
        assert_eq!(risk.score, 100);
    }
}
