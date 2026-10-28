//! Trust Layer: verifiable merge receipts.
//!
//! A receipt is an immutable, local-first record of *what merged* and *what was
//! checked*. Its `content_hash` is SHA-256 over canonical JSON with the hash
//! field excluded, so editing any stored field is detectable offline.

pub mod builder;

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::guard::GuardFinding;

pub const RECEIPT_VERSION: u32 = 1;
/// Receipts are capped so a long-lived repo never turns listing into a crawl.
const MAX_LISTED: usize = 1_000;
const MAX_PATHS: usize = 200;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ConfidenceLevel {
    Low,
    Medium,
    High,
}

impl ConfidenceLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct AgentEvidence {
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct WorkspaceEvidence {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct DiffEvidence {
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
    /// Sorted, capped at 200.
    #[serde(default)]
    pub paths: Vec<String>,
    /// Subset of `paths`.
    #[serde(default)]
    pub test_files: Vec<String>,
    /// True when a test file changed or the diff adds inline test markers
    /// (`#[test]` / `#[cfg(test)]`). Rust projects keep tests in source files.
    #[serde(default)]
    pub tests_changed: bool,
}

impl DiffEvidence {
    pub fn normalize(mut self) -> Self {
        self.paths.sort();
        self.paths.dedup();
        self.paths.truncate(MAX_PATHS);
        self.test_files.sort();
        self.test_files.dedup();
        self.test_files.retain(|path| self.paths.contains(path));
        self
    }

    pub fn lines(&self) -> u32 {
        self.additions.saturating_add(self.deletions)
    }

    pub fn production_changed(&self) -> bool {
        self.paths
            .iter()
            .any(|path| !self.test_files.iter().any(|test| test == path))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GateEvidence {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    pub passed: bool,
    pub skipped: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
    /// Redacted, last 15 lines.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GuardEvidence {
    pub ran: bool,
    pub passed: bool,
    pub errors: u32,
    pub warnings: u32,
    #[serde(default)]
    pub findings: Vec<GuardFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ReviewEvidence {
    pub open_comments: u32,
    pub resolved_comments: u32,
    pub viewed_files: u32,
    pub total_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Confidence {
    pub level: ConfidenceLevel,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Receipt {
    pub version: u32,
    pub id: String,
    pub card_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub intent: String,
    pub agent: AgentEvidence,
    pub workspace: WorkspaceEvidence,
    pub diff: DiffEvidence,
    pub gate: GateEvidence,
    pub guard: GuardEvidence,
    pub tests_changed: bool,
    pub review: ReviewEvidence,
    pub confidence: Confidence,
    pub created_at: DateTime<Utc>,
    /// SHA-256 hex over canonical JSON excluding this field.
    pub content_hash: String,
}

impl Receipt {
    pub fn seal(&mut self) {
        self.content_hash = compute_content_hash(self);
    }

    pub fn hash_ok(&self) -> bool {
        !self.content_hash.is_empty() && self.content_hash == compute_content_hash(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptSummary {
    pub id: String,
    pub card_id: String,
    pub created_at: DateTime<Utc>,
    pub confidence: ConfidenceLevel,
    pub gate_passed: bool,
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub guard_errors: u32,
    pub guard_warnings: u32,
}

impl From<&Receipt> for ReceiptSummary {
    fn from(receipt: &Receipt) -> Self {
        Self {
            id: receipt.id.clone(),
            card_id: receipt.card_id.clone(),
            created_at: receipt.created_at,
            confidence: receipt.confidence.level,
            gate_passed: receipt.gate.passed && !receipt.gate.skipped,
            files: receipt.diff.files,
            additions: receipt.diff.additions,
            deletions: receipt.diff.deletions,
            guard_errors: receipt.guard.errors,
            guard_warnings: receipt.guard.warnings,
        }
    }
}

/// Input to the pure confidence function. Kept separate so every rule is
/// table-testable without constructing a whole receipt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConfidenceInput {
    pub gate_ran: bool,
    pub gate_passed: bool,
    pub guard_ran: bool,
    pub guard_errors: u32,
    pub guard_warnings: u32,
    pub production_changed: bool,
    pub tests_changed: bool,
    pub files: u32,
    pub lines: u32,
    pub open_comments: u32,
}

impl Default for ConfidenceInput {
    fn default() -> Self {
        Self {
            gate_ran: true,
            gate_passed: true,
            guard_ran: true,
            guard_errors: 0,
            guard_warnings: 0,
            production_changed: true,
            tests_changed: true,
            files: 1,
            lines: 10,
            open_comments: 0,
        }
    }
}

pub fn assess_confidence(input: &ConfidenceInput) -> Confidence {
    let mut level = ConfidenceLevel::High;
    let mut reasons = Vec::new();

    let mut lower = |candidate: ConfidenceLevel, reason: String| {
        if candidate < level {
            level = candidate;
        }
        reasons.push(reason);
    };

    if !input.gate_ran {
        lower(ConfidenceLevel::Low, "no acceptance gate ran".into());
    } else if !input.gate_passed {
        lower(ConfidenceLevel::Low, "acceptance gate failed".into());
    }

    if !input.guard_ran {
        lower(ConfidenceLevel::Medium, "guard scan not run".into());
    }
    if input.guard_errors > 0 {
        lower(
            ConfidenceLevel::Low,
            format!("{} guard error finding(s)", input.guard_errors),
        );
    }
    if input.guard_warnings > 0 {
        lower(
            ConfidenceLevel::Medium,
            format!("{} guard warning(s)", input.guard_warnings),
        );
    }

    if input.production_changed && !input.tests_changed {
        lower(
            ConfidenceLevel::Medium,
            "production code changed without test changes".into(),
        );
    }
    if input.lines > 800 || input.files > 40 {
        lower(
            ConfidenceLevel::Medium,
            format!("large diff ({} files, {} lines)", input.files, input.lines),
        );
    }
    if input.open_comments > 0 {
        lower(
            ConfidenceLevel::Low,
            format!("{} unresolved review comment(s)", input.open_comments),
        );
    }

    if reasons.is_empty() {
        reasons.push("gate passed, guard clean, tests updated".into());
    }

    Confidence { level, reasons }
}

/// SHA-256 over canonical JSON with `content_hash` removed.
pub fn compute_content_hash(receipt: &Receipt) -> String {
    let mut value = serde_json::to_value(receipt).expect("receipt serializes");
    if let Some(object) = value.as_object_mut() {
        object.remove("content_hash");
    }
    // serde_json maps are ordered deterministically (BTreeMap), so this is a
    // stable canonical form for the same struct.
    let canonical = serde_json::to_string(&value).expect("canonical receipt serializes");
    let digest = Sha256::digest(canonical.as_bytes());
    hex(&digest)
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write;
        let _ = write!(out, "{byte:02x}");
    }
    out
}

pub fn receipts_dir(root: &Path) -> PathBuf {
    root.join(".board").join("receipts")
}

pub fn save_receipt(root: &Path, mut receipt: Receipt) -> Result<Receipt> {
    validate_id(&receipt.id)?;
    receipt.seal();

    let dir = receipts_dir(root);
    std::fs::create_dir_all(&dir).with_context(|| format!("failed to create {}", dir.display()))?;

    let json_path = dir.join(format!("{}.json", receipt.id));
    // Receipts are immutable: a second write with the same id is a no-op.
    if !json_path.exists() {
        let json = serde_json::to_string_pretty(&receipt).context("failed to serialize receipt")?;
        std::fs::write(&json_path, json)
            .with_context(|| format!("failed to write {}", json_path.display()))?;
        let md_path = dir.join(format!("{}.md", receipt.id));
        std::fs::write(&md_path, to_markdown(&receipt))
            .with_context(|| format!("failed to write {}", md_path.display()))?;
    }
    Ok(receipt)
}

pub fn load_receipt(root: &Path, id: &str) -> Result<Receipt> {
    validate_id(id)?;
    let path = receipts_dir(root).join(format!("{id}.json"));
    let content =
        std::fs::read_to_string(&path).with_context(|| format!("receipt `{id}` not found"))?;
    let receipt: Receipt = serde_json::from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(receipt)
}

pub fn read_markdown(root: &Path, id: &str) -> Result<String> {
    validate_id(id)?;
    let path = receipts_dir(root).join(format!("{id}.md"));
    std::fs::read_to_string(&path).with_context(|| format!("receipt `{id}` not found"))
}

/// All receipts, newest first, optionally filtered by card.
pub fn list_receipts(root: &Path, card_id: Option<&str>) -> Result<Vec<Receipt>> {
    let dir = receipts_dir(root);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut receipts = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if !id.starts_with("rcpt_") {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(receipt) = serde_json::from_str::<Receipt>(&content) else {
            continue;
        };
        if let Some(card) = card_id {
            if receipt.card_id != card {
                continue;
            }
        }
        receipts.push(receipt);
    }
    receipts.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    receipts.truncate(MAX_LISTED);
    Ok(receipts)
}

/// Accept either an exact `rcpt_…` id or a card id; card ids resolve to the
/// newest receipt for that card.
pub fn find_receipt(root: &Path, selector: &str) -> Result<Receipt> {
    if selector.starts_with("rcpt_") {
        return load_receipt(root, selector);
    }
    list_receipts(root, Some(selector))?
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no receipt found for card `{selector}`"))
}

pub fn to_markdown(receipt: &Receipt) -> String {
    let mut out = String::new();
    out.push_str(&format!("# Merge receipt `{}`\n\n", receipt.id));
    out.push_str(&format!(
        "- **Card:** {} — {}\n",
        receipt.card_id, receipt.intent
    ));
    out.push_str(&format!(
        "- **Created:** {}\n",
        receipt.created_at.to_rfc3339()
    ));
    out.push_str(&format!(
        "- **Confidence:** {}\n",
        receipt.confidence.level.as_str().to_uppercase()
    ));
    if let Some(run_id) = &receipt.run_id {
        out.push_str(&format!("- **Run:** {run_id}\n"));
    }
    out.push('\n');

    out.push_str("## What merged\n\n");
    if let Some(branch) = &receipt.workspace.branch {
        out.push_str(&format!("- Branch: `{branch}`\n"));
    }
    out.push_str(&format!(
        "- Base → head: `{}` → `{}`\n",
        short(&receipt.workspace.base_sha),
        short(&receipt.workspace.head_sha)
    ));
    out.push_str(&format!(
        "- Diff: {} files, +{} −{}\n",
        receipt.diff.files, receipt.diff.additions, receipt.diff.deletions
    ));
    out.push_str(&format!(
        "- Tests changed: {}\n",
        if receipt.tests_changed { "yes" } else { "no" }
    ));
    if !receipt.diff.paths.is_empty() {
        out.push_str("\n<details><summary>Changed files</summary>\n\n");
        for path in &receipt.diff.paths {
            out.push_str(&format!("- `{path}`\n"));
        }
        out.push_str("\n</details>\n");
    }
    out.push('\n');

    out.push_str("## Gate\n\n");
    if receipt.gate.skipped {
        out.push_str("- **Skipped** (no acceptance gate ran)\n");
    } else {
        out.push_str(&format!(
            "- **{}**{}\n",
            if receipt.gate.passed {
                "Passed"
            } else {
                "Failed"
            },
            receipt
                .gate
                .duration_ms
                .map(|ms| format!(" in {:.1}s", ms as f64 / 1000.0))
                .unwrap_or_default()
        ));
        if let Some(command) = &receipt.gate.command {
            out.push_str(&format!("- Command: `{}`\n", command.replace('`', "'")));
        }
        if let Some(log_path) = &receipt.gate.log_path {
            out.push_str(&format!("- Log: `{log_path}`\n"));
        }
        if let Some(tail) = &receipt.gate.tail {
            out.push_str("\n```text\n");
            out.push_str(tail.trim_end());
            out.push_str("\n```\n");
        }
    }
    out.push('\n');

    out.push_str("## Guard\n\n");
    if !receipt.guard.ran {
        out.push_str("- Guard did not run\n");
    } else {
        out.push_str(&format!(
            "- {} error(s), {} warning(s) — {}\n",
            receipt.guard.errors,
            receipt.guard.warnings,
            if receipt.guard.passed {
                "passed"
            } else {
                "failed"
            }
        ));
        if !receipt.guard.findings.is_empty() {
            out.push_str("\n| Severity | Check | Location | Message |\n");
            out.push_str("|---|---|---|---|\n");
            for finding in &receipt.guard.findings {
                let location = match finding.line {
                    Some(line) => format!("{}:{}", finding.path, line),
                    None => finding.path.clone(),
                };
                out.push_str(&format!(
                    "| {} | {} | `{}` | {} |\n",
                    finding.severity.as_str().to_uppercase(),
                    finding.check.as_str(),
                    escape_cell(&location),
                    escape_cell(&finding.message)
                ));
            }
        }
    }
    out.push('\n');

    out.push_str("## Review\n\n");
    out.push_str(&format!(
        "- {} open comment(s), {} resolved\n",
        receipt.review.open_comments, receipt.review.resolved_comments
    ));
    out.push_str(&format!(
        "- {}/{} file(s) viewed\n",
        receipt.review.viewed_files, receipt.review.total_files
    ));
    out.push('\n');

    out.push_str("## Why this confidence\n\n");
    for reason in &receipt.confidence.reasons {
        out.push_str(&format!("- {reason}\n"));
    }
    out.push('\n');

    out.push_str("## Integrity\n\n");
    out.push_str(&format!("- SHA-256: `{}`\n", receipt.content_hash));
    out.push_str(&format!(
        "- Verify: `barkcli receipt verify {}`\n",
        receipt.id
    ));
    out.push_str("\n_This receipt proves process, not correctness._\n");
    out
}

fn short(sha: &Option<String>) -> &str {
    sha.as_deref()
        .map(|value| {
            if value.len() > 12 {
                &value[..12]
            } else {
                value
            }
        })
        .unwrap_or("unknown")
}

fn escape_cell(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', " ")
}

fn validate_id(id: &str) -> Result<()> {
    if !id.starts_with("rcpt_")
        || id.len() > 80
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
    {
        bail!("invalid receipt id `{id}`");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::guard::{CheckId, Severity};

    fn sample_receipt() -> Receipt {
        let mut receipt = Receipt {
            version: RECEIPT_VERSION,
            id: "rcpt_abc123def456".into(),
            card_id: "c-1".into(),
            task_id: None,
            run_id: Some("run-1".into()),
            thread_id: None,
            intent: "Fix login".into(),
            agent: AgentEvidence {
                provider: "opencode".into(),
                model: Some("m".into()),
                role: Some("coder".into()),
                agent_id: None,
            },
            workspace: WorkspaceEvidence {
                branch: Some("feat/login".into()),
                base_sha: Some("aaaaaaaaaaaaaaaa".into()),
                head_sha: Some("bbbbbbbbbbbbbbbb".into()),
                worktree: None,
            },
            diff: DiffEvidence {
                files: 2,
                additions: 10,
                deletions: 2,
                paths: vec!["src/a.rs".into(), "src/a_test.rs".into()],
                test_files: vec!["src/a_test.rs".into()],
                tests_changed: true,
            }
            .normalize(),
            gate: GateEvidence {
                command: Some("cargo test".into()),
                passed: true,
                skipped: false,
                duration_ms: Some(1200),
                log_path: None,
                tail: Some("ok".into()),
                finished_at: None,
            },
            guard: GuardEvidence {
                ran: true,
                passed: false,
                errors: 0,
                warnings: 1,
                findings: vec![GuardFinding::new(
                    CheckId::MissingTests,
                    Severity::Warn,
                    "src/a.rs",
                    None,
                    "no tests",
                )],
            },
            tests_changed: true,
            review: ReviewEvidence {
                open_comments: 0,
                resolved_comments: 1,
                viewed_files: 2,
                total_files: 2,
            },
            confidence: Confidence {
                level: ConfidenceLevel::Medium,
                reasons: vec!["1 guard warning(s)".into()],
            },
            created_at: Utc::now(),
            content_hash: String::new(),
        };
        receipt.seal();
        receipt
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bark_receipt_{}_{}",
            name,
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn clean_input_is_high_confidence() {
        let confidence = assess_confidence(&ConfidenceInput::default());
        assert_eq!(confidence.level, ConfidenceLevel::High);
        assert_eq!(
            confidence.reasons,
            vec!["gate passed, guard clean, tests updated"]
        );
    }

    #[test]
    fn confidence_rules_lower_the_minimum() {
        let cases = [
            (
                ConfidenceInput {
                    gate_ran: false,
                    ..Default::default()
                },
                ConfidenceLevel::Low,
                "no acceptance gate",
            ),
            (
                ConfidenceInput {
                    gate_passed: false,
                    ..Default::default()
                },
                ConfidenceLevel::Low,
                "gate failed",
            ),
            (
                ConfidenceInput {
                    guard_ran: false,
                    ..Default::default()
                },
                ConfidenceLevel::Medium,
                "guard scan not run",
            ),
            (
                ConfidenceInput {
                    guard_errors: 2,
                    ..Default::default()
                },
                ConfidenceLevel::Low,
                "guard error",
            ),
            (
                ConfidenceInput {
                    guard_warnings: 3,
                    ..Default::default()
                },
                ConfidenceLevel::Medium,
                "guard warning",
            ),
            (
                ConfidenceInput {
                    tests_changed: false,
                    ..Default::default()
                },
                ConfidenceLevel::Medium,
                "without test changes",
            ),
            (
                ConfidenceInput {
                    files: 41,
                    ..Default::default()
                },
                ConfidenceLevel::Medium,
                "large diff",
            ),
            (
                ConfidenceInput {
                    open_comments: 1,
                    ..Default::default()
                },
                ConfidenceLevel::Low,
                "unresolved review comment",
            ),
        ];
        for (input, expected, needle) in cases {
            let confidence = assess_confidence(&input);
            assert_eq!(confidence.level, expected, "{needle}");
            assert!(
                confidence
                    .reasons
                    .iter()
                    .any(|reason| reason.contains(needle)),
                "missing reason `{needle}` in {:?}",
                confidence.reasons
            );
        }
    }

    #[test]
    fn gate_failure_wins_over_guard_warning() {
        let confidence = assess_confidence(&ConfidenceInput {
            gate_passed: false,
            guard_warnings: 1,
            ..Default::default()
        });
        assert_eq!(confidence.level, ConfidenceLevel::Low);
        assert!(confidence.reasons.iter().any(|r| r.contains("gate failed")));
        assert!(confidence
            .reasons
            .iter()
            .any(|r| r.contains("guard warning")));
    }

    #[test]
    fn hash_is_stable_and_detects_tampering() {
        let receipt = sample_receipt();
        assert!(receipt.hash_ok());
        assert_eq!(
            compute_content_hash(&receipt),
            compute_content_hash(&receipt)
        );

        let mut tampered = receipt.clone();
        tampered.diff.additions += 1;
        assert!(!tampered.hash_ok());

        let mut relabelled = receipt;
        relabelled.card_id = "c-2".into();
        assert!(!relabelled.hash_ok());
    }

    #[test]
    fn hash_does_not_include_itself() {
        let mut receipt = sample_receipt();
        let original = receipt.content_hash.clone();
        receipt.content_hash = "deadbeef".into();
        assert_eq!(compute_content_hash(&receipt), original);
    }

    #[test]
    fn saves_loads_and_reads_markdown() {
        let dir = temp_dir("save");
        let receipt = sample_receipt();
        let id = receipt.id.clone();
        let saved = save_receipt(&dir, receipt).unwrap();
        assert!(saved.hash_ok());
        assert!(receipts_dir(&dir).join(format!("{id}.json")).is_file());
        assert!(receipts_dir(&dir).join(format!("{id}.md")).is_file());

        let loaded = load_receipt(&dir, &id).unwrap();
        assert_eq!(loaded.id, id);
        assert!(loaded.content_hash == saved.content_hash);

        let markdown = read_markdown(&dir, &id).unwrap();
        assert!(markdown.contains("Merge receipt"));
        assert!(markdown.contains("cargo test"));
        assert!(markdown.contains("proves process, not correctness"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn lists_newest_first_and_filters_by_card() {
        let dir = temp_dir("list");
        let mut first = sample_receipt();
        first.id = "rcpt_first000001".into();
        first.card_id = "c-1".into();
        first.created_at = Utc::now() - chrono::Duration::seconds(10);
        first.seal();
        let mut second = sample_receipt();
        second.id = "rcpt_second00002".into();
        second.card_id = "c-2".into();
        second.seal();

        save_receipt(&dir, first).unwrap();
        save_receipt(&dir, second).unwrap();

        let all = list_receipts(&dir, None).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].card_id, "c-2");

        let filtered = list_receipts(&dir, Some("c-1")).unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(find_receipt(&dir, "c-1").unwrap().card_id, "c-1");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn immutable_second_write_keeps_original() {
        let dir = temp_dir("immutable");
        let receipt = sample_receipt();
        let id = receipt.id.clone();
        save_receipt(&dir, receipt.clone()).unwrap();

        let mut changed = receipt;
        changed.intent = "different".into();
        save_receipt(&dir, changed).unwrap();

        assert_eq!(load_receipt(&dir, &id).unwrap().intent, "Fix login");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_path_like_ids() {
        assert!(validate_id("rcpt_../escape").is_err());
        assert!(validate_id("../../etc/passwd").is_err());
        assert!(validate_id("rcpt_ok").is_ok());
    }

    #[test]
    fn diff_evidence_normalizes_and_caps() {
        let mut paths: Vec<String> = (0..250).map(|i| format!("src/{i}.rs")).collect();
        paths.push("src/0.rs".into());
        let evidence = DiffEvidence {
            files: 251,
            additions: 1,
            deletions: 1,
            paths,
            test_files: vec!["src/missing_test.rs".into(), "src/1.rs".into()],
            tests_changed: false,
        }
        .normalize();
        assert_eq!(evidence.paths.len(), 200);
        assert_eq!(evidence.paths[0], "src/0.rs");
        assert_eq!(evidence.test_files, vec!["src/1.rs"]);
    }

    #[test]
    fn markdown_escapes_table_cells() {
        let mut receipt = sample_receipt();
        receipt.guard.findings[0].message = "a | b".into();
        let markdown = to_markdown(&receipt);
        assert!(markdown.contains("a \\| b"));
    }
}
