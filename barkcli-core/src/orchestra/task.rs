use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorkType {
    #[default]
    Implementation,
    Research,
    Design,
    Testing,
    Review,
    Documentation,
    Debugging,
    Integration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Simple,
    #[default]
    Moderate,
    Complex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Risk {
    #[default]
    Low,
    Medium,
    High,
    SecurityCritical,
}

/// Deterministic task analysis (O3.1). Optional model refinement can be added later
/// behind schema validation; this baseline requires no LLM.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskAnalysis {
    pub work_type: WorkType,
    pub difficulty: Difficulty,
    pub risk: Risk,
    #[serde(default)]
    pub requires_tool_calling: bool,
    #[serde(default)]
    pub requires_long_context: bool,
    #[serde(default)]
    pub signals: Vec<String>,
}

impl TaskAnalysis {
    pub fn classify(title: &str, description: Option<&str>, role_hint: Option<&str>) -> Self {
        let text = format!(
            "{}\n{}\n{}",
            title,
            description.unwrap_or(""),
            role_hint.unwrap_or("")
        )
        .to_lowercase();
        let mut signals = Vec::new();
        let work_type = if contains_any(&text, &["review", "audit", "code review"]) {
            signals.push("review keyword".into());
            WorkType::Review
        } else if contains_any(&text, &["test", "spec", "qa", "regression", "coverage"]) {
            signals.push("testing keyword".into());
            WorkType::Testing
        } else if contains_any(&text, &["doc", "readme", "changelog", "guide", "comment"]) {
            signals.push("documentation keyword".into());
            WorkType::Documentation
        } else if contains_any(&text, &["debug", "fix bug", "failing", "trace", "investigate error"]) {
            signals.push("debug keyword".into());
            WorkType::Debugging
        } else if contains_any(&text, &["design", "architect", "plan", "rfc", "proposal"]) {
            signals.push("design keyword".into());
            WorkType::Design
        } else if contains_any(&text, &["research", "explore", "compare", "evaluate options"]) {
            signals.push("research keyword".into());
            WorkType::Research
        } else if contains_any(&text, &["integrat", "merge conflict", "rebase", "combine"]) {
            signals.push("integration keyword".into());
            WorkType::Integration
        } else {
            WorkType::Implementation
        };

        let risk = if contains_any(
            &text,
            &["auth", "security", "secret", "token", "credential", "payment", "encrypt", "vuln", "permission"],
        ) {
            signals.push("security-sensitive keyword".into());
            Risk::SecurityCritical
        } else if contains_any(&text, &["migration", "database", "delete", "production", "deploy"]) {
            signals.push("high-impact keyword".into());
            Risk::High
        } else if contains_any(&text, &["refactor", "multi-file", "api change"]) {
            Risk::Medium
        } else {
            Risk::Low
        };

        let difficulty = if contains_any(&text, &["architecture", "complex", "multi-step", "system-wide", "rewrite"]) {
            Difficulty::Complex
        } else if contains_any(&text, &["typo", "small fix", "rename", "update text", "bump version"]) {
            Difficulty::Simple
        } else {
            Difficulty::Moderate
        };

        let requires_tool_calling = !matches!(work_type, WorkType::Documentation) || contains_any(&text, &["update", "edit", "fix"]);
        let requires_long_context = contains_any(&text, &["entire repo", "codebase", "many files", "across modules"])
            || matches!(difficulty, Difficulty::Complex);

        Self {
            work_type,
            difficulty,
            risk,
            requires_tool_calling,
            requires_long_context,
            signals,
        }
    }
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_security_review() {
        let a = TaskAnalysis::classify("Audit auth token handling", None, Some("reviewer"));
        assert_eq!(a.work_type, WorkType::Review);
        assert_eq!(a.risk, Risk::SecurityCritical);
    }

    #[test]
    fn classifies_simple_docs() {
        let a = TaskAnalysis::classify("Fix typo in README", None, None);
        assert_eq!(a.work_type, WorkType::Documentation);
        assert_eq!(a.difficulty, Difficulty::Simple);
    }
}
