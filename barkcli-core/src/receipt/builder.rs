//! Pure receipt construction from evidence gathered by either merge path.

use chrono::{DateTime, Utc};

use super::{
    assess_confidence, AgentEvidence, ConfidenceInput, DiffEvidence, GateEvidence, GuardEvidence,
    Receipt, ReviewEvidence, WorkspaceEvidence, RECEIPT_VERSION,
};
use crate::guard::GuardReport;

const MAX_INTENT_CHARS: usize = 240;
const MAX_GUARD_FINDINGS: usize = 50;

#[derive(Debug, Clone)]
pub struct ReceiptInput {
    pub card_id: String,
    pub card_title: String,
    pub card_description: Option<String>,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub thread_id: Option<String>,
    pub agent: AgentEvidence,
    pub workspace: WorkspaceEvidence,
    pub diff: DiffEvidence,
    pub gate: Option<GateEvidence>,
    pub guard: Option<GuardReport>,
    pub review: ReviewEvidence,
    pub created_at: Option<DateTime<Utc>>,
}

pub fn build(input: ReceiptInput) -> Receipt {
    let diff = input.diff.normalize();
    let tests_changed = !diff.test_files.is_empty();

    // `None` means no gate ran. `skipped` is the on-wire representation of that
    // fact so confidence never mistakes it for a failed gate.
    let gate = input.gate.unwrap_or(GateEvidence {
        skipped: true,
        ..GateEvidence::default()
    });

    let guard = match input.guard {
        Some(report) => {
            let (errors, warnings, _) = report.counts();
            GuardEvidence {
                ran: true,
                passed: report.passed,
                errors: errors as u32,
                warnings: warnings as u32,
                findings: report
                    .findings
                    .into_iter()
                    .take(MAX_GUARD_FINDINGS)
                    .collect(),
            }
        }
        None => GuardEvidence::default(),
    };

    let confidence = assess_confidence(&ConfidenceInput {
        gate_ran: !gate.skipped,
        gate_passed: gate.passed,
        guard_ran: guard.ran,
        guard_errors: guard.errors,
        guard_warnings: guard.warnings,
        production_changed: diff.production_changed(),
        tests_changed,
        files: diff.files,
        lines: diff.lines(),
        open_comments: input.review.open_comments,
    });

    let mut receipt = Receipt {
        version: RECEIPT_VERSION,
        id: new_id(),
        card_id: input.card_id,
        task_id: input.task_id,
        run_id: input.run_id,
        thread_id: input.thread_id,
        intent: intent_of(&input.card_title, input.card_description.as_deref()),
        agent: input.agent,
        workspace: input.workspace,
        diff,
        gate,
        guard,
        tests_changed,
        review: input.review,
        confidence,
        created_at: input.created_at.unwrap_or_else(Utc::now),
        content_hash: String::new(),
    };
    receipt.seal();
    receipt
}

pub fn new_id() -> String {
    format!(
        "rcpt_{}",
        &uuid::Uuid::new_v4().simple().to_string()[..12]
    )
}

fn intent_of(title: &str, description: Option<&str>) -> String {
    let mut intent = title.trim().to_string();
    if let Some(line) = description
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
    {
        if !intent.is_empty() {
            intent.push_str(" — ");
        }
        intent.push_str(line);
    }
    if intent.chars().count() > MAX_INTENT_CHARS {
        intent = intent.chars().take(MAX_INTENT_CHARS).collect();
        intent.push('…');
    }
    intent
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::guard::{CheckId, GuardFinding, Severity};
    use crate::receipt::ConfidenceLevel;

    fn base_input() -> ReceiptInput {
        ReceiptInput {
            card_id: "c-1".into(),
            card_title: "Fix login".into(),
            card_description: Some("\n\nUsers cannot log in.\nMore detail.".into()),
            task_id: None,
            run_id: Some("run-1".into()),
            thread_id: None,
            agent: AgentEvidence {
                provider: "opencode".into(),
                ..AgentEvidence::default()
            },
            workspace: WorkspaceEvidence {
                branch: Some("feat/login".into()),
                ..WorkspaceEvidence::default()
            },
            diff: DiffEvidence {
                files: 2,
                additions: 40,
                deletions: 5,
                paths: vec!["src/login.rs".into(), "src/login_test.rs".into()],
                test_files: vec!["src/login_test.rs".into()],
            },
            gate: Some(GateEvidence {
                command: Some("cargo test".into()),
                passed: true,
                skipped: false,
                duration_ms: Some(1500),
                ..GateEvidence::default()
            }),
            guard: Some(clean_report()),
            review: ReviewEvidence {
                total_files: 2,
                viewed_files: 2,
                ..ReviewEvidence::default()
            },
            created_at: None,
        }
    }

    fn clean_report() -> GuardReport {
        GuardReport {
            version: 1,
            generated_at: Utc::now(),
            base: "HEAD".into(),
            head: "WORKTREE".into(),
            files: 2,
            additions: 40,
            deletions: 5,
            checks: vec!["secret".into()],
            findings: Vec::new(),
            passed: true,
        }
    }

    #[test]
    fn builds_high_confidence_receipt() {
        let receipt = build(base_input());
        assert!(receipt.id.starts_with("rcpt_"));
        assert_eq!(receipt.id.len(), 17);
        assert_eq!(receipt.confidence.level, ConfidenceLevel::High);
        assert_eq!(receipt.intent, "Fix login — Users cannot log in.");
        assert!(receipt.tests_changed);
        assert!(receipt.hash_ok());
    }

    #[test]
    fn missing_gate_marks_skipped_and_low() {
        let mut input = base_input();
        input.gate = None;
        let receipt = build(input);
        assert!(receipt.gate.skipped);
        assert_eq!(receipt.confidence.level, ConfidenceLevel::Low);
        assert!(receipt
            .confidence
            .reasons
            .iter()
            .any(|reason| reason.contains("no acceptance gate")));
    }

    #[test]
    fn guard_warning_lowers_to_medium_and_is_recorded() {
        let mut input = base_input();
        let mut report = clean_report();
        report.passed = false;
        report.findings = vec![GuardFinding::new(
            CheckId::MissingTests,
            Severity::Warn,
            "src/login.rs",
            None,
            "no tests",
        )];
        input.guard = Some(report);
        let receipt = build(input);
        assert_eq!(receipt.confidence.level, ConfidenceLevel::Medium);
        assert_eq!(receipt.guard.warnings, 1);
        assert_eq!(receipt.guard.findings.len(), 1);
    }

    #[test]
    fn missing_guard_is_medium() {
        let mut input = base_input();
        input.guard = None;
        let receipt = build(input);
        assert!(!receipt.guard.ran);
        assert_eq!(receipt.confidence.level, ConfidenceLevel::Medium);
        assert!(receipt
            .confidence
            .reasons
            .iter()
            .any(|reason| reason.contains("guard scan not run")));
    }

    #[test]
    fn guard_findings_are_capped() {
        let mut input = base_input();
        let mut report = clean_report();
        report.passed = false;
        report.findings = (0..80)
            .map(|index| {
                GuardFinding::new(
                    CheckId::DebugLeftover,
                    Severity::Info,
                    format!("src/f{index}.rs"),
                    Some(index),
                    "console.log",
                )
            })
            .collect();
        input.guard = Some(report);
        let receipt = build(input);
        assert_eq!(receipt.guard.findings.len(), MAX_GUARD_FINDINGS);
    }

    #[test]
    fn intent_truncates_and_handles_empty_description() {
        let mut input = base_input();
        input.card_title = "T".repeat(300);
        input.card_description = None;
        let receipt = build(input);
        assert_eq!(receipt.intent.chars().count(), MAX_INTENT_CHARS + 1);
        assert!(receipt.intent.ends_with('…'));
    }
}
