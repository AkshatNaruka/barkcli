//! Trust Layer: deterministic, offline pre-merge scanning.
//!
//! `guard::scan` is deliberately pure Rust + git plumbing: no network, no AI,
//! no new dependencies. It answers one question with reproducible findings:
//! "what in this diff should a reviewer look at before merging?"

pub mod checks;
pub mod deps;
pub mod diff;

use std::path::Path;
use std::process::Command;

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::config::GuardSettings;
use diff::{diff_for_scope, DiffScope};

pub use diff::{ChangedFile, DiffLine, DiffSet, FileStatus};

/// Bumped whenever finding semantics change; receipts pin this.
pub const GUARD_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warn,
    Error,
}

impl Severity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CheckId {
    Secret,
    UndeclaredDependency,
    SuspiciousDependency,
    LockfileDrift,
    DangerousPattern,
    MissingTests,
    DebugLeftover,
    LargeDiff,
}

impl CheckId {
    pub const ALL: [CheckId; 8] = [
        CheckId::Secret,
        CheckId::UndeclaredDependency,
        CheckId::SuspiciousDependency,
        CheckId::LockfileDrift,
        CheckId::DangerousPattern,
        CheckId::MissingTests,
        CheckId::DebugLeftover,
        CheckId::LargeDiff,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Secret => "secret",
            Self::UndeclaredDependency => "undeclared_dependency",
            Self::SuspiciousDependency => "suspicious_dependency",
            Self::LockfileDrift => "lockfile_drift",
            Self::DangerousPattern => "dangerous_pattern",
            Self::MissingTests => "missing_tests",
            Self::DebugLeftover => "debug_leftover",
            Self::LargeDiff => "large_diff",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "secret" | "secrets" => Some(Self::Secret),
            "undeclared_dependency" => Some(Self::UndeclaredDependency),
            "suspicious_dependency" => Some(Self::SuspiciousDependency),
            "lockfile_drift" => Some(Self::LockfileDrift),
            "dangerous_pattern" => Some(Self::DangerousPattern),
            "missing_tests" => Some(Self::MissingTests),
            "debug_leftover" => Some(Self::DebugLeftover),
            "large_diff" => Some(Self::LargeDiff),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GuardFinding {
    pub check: CheckId,
    pub severity: Severity,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    pub message: String,
    /// Never contains a raw secret: evidence is redacted before it is stored.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

impl GuardFinding {
    pub fn new(
        check: CheckId,
        severity: Severity,
        path: impl Into<String>,
        line: Option<u32>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            check,
            severity,
            path: path.into(),
            line,
            message: message.into(),
            evidence: None,
            suggestion: None,
        }
    }

    pub fn with_evidence(mut self, evidence: impl Into<String>) -> Self {
        self.evidence = Some(evidence.into());
        self
    }

    pub fn with_suggestion(mut self, suggestion: impl Into<String>) -> Self {
        self.suggestion = Some(suggestion.into());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardReport {
    pub version: u32,
    pub generated_at: DateTime<Utc>,
    pub base: String,
    pub head: String,
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub checks: Vec<String>,
    pub findings: Vec<GuardFinding>,
    pub passed: bool,
}

impl GuardReport {
    /// (errors, warnings, infos)
    pub fn counts(&self) -> (usize, usize, usize) {
        let mut counts = (0, 0, 0);
        for finding in &self.findings {
            match finding.severity {
                Severity::Error => counts.0 += 1,
                Severity::Warn => counts.1 += 1,
                Severity::Info => counts.2 += 1,
            }
        }
        counts
    }

    pub fn has_errors(&self) -> bool {
        self.findings
            .iter()
            .any(|finding| finding.severity == Severity::Error)
    }
}

#[derive(Debug, Clone)]
pub struct GuardOptions {
    pub scope: DiffScope,
    pub checks: Vec<CheckId>,
    pub large_files: u32,
    pub large_lines: u32,
}

impl Default for GuardOptions {
    fn default() -> Self {
        Self {
            scope: DiffScope::Worktree,
            checks: CheckId::ALL.to_vec(),
            large_files: 40,
            large_lines: 800,
        }
    }
}

impl GuardOptions {
    pub fn from_settings(scope: DiffScope, settings: &GuardSettings) -> Self {
        let checks: Vec<CheckId> = settings
            .checks
            .iter()
            .filter_map(|check| CheckId::parse(check))
            .collect();
        Self {
            scope,
            checks,
            large_files: settings.large_diff_files,
            large_lines: settings.large_diff_lines,
        }
    }
}

/// Run the configured checks over the diff selected by `options.scope`.
pub fn scan(root: &Path, options: &GuardOptions) -> Result<GuardReport> {
    let diff = diff_for_scope(root, &options.scope)?;
    Ok(scan_diff(root, &diff, options))
}

/// Scan an already-resolved diff. Used by receipt creation and merge paths so
/// the same diff drives both the report and the receipt evidence.
pub fn scan_diff(root: &Path, diff: &DiffSet, options: &GuardOptions) -> GuardReport {
    let context = checks::CheckContext {
        root,
        diff,
        large_files: options.large_files,
        large_lines: options.large_lines,
    };

    let mut findings = Vec::new();
    for check in &options.checks {
        findings.extend(checks::run(*check, &context));
    }
    findings.sort_by(|a, b| {
        b.severity
            .cmp(&a.severity)
            .then_with(|| a.path.cmp(&b.path))
            .then_with(|| a.line.cmp(&b.line))
            .then_with(|| a.check.as_str().cmp(b.check.as_str()))
    });

    let (files, additions, deletions) = diff.stats();
    let passed = !findings
        .iter()
        .any(|finding| finding.severity == Severity::Error);

    GuardReport {
        version: GUARD_VERSION,
        generated_at: Utc::now(),
        base: diff.base.clone(),
        head: diff.head.clone(),
        files,
        additions,
        deletions,
        checks: options
            .checks
            .iter()
            .map(|check| check.as_str().to_string())
            .collect(),
        findings,
        passed,
    }
}

/// Scan `branch` against the merge base with `HEAD`.
pub fn scan_branch(root: &Path, branch: &str) -> Result<GuardReport> {
    scan_branch_with(root, branch, &GuardSettings::default())
}

/// Resolve `merge-base(HEAD, branch)..branch`, run checks, and return both the
/// diff and report so merge paths can build receipts without re-scanning.
pub fn scan_branch_diff(
    root: &Path,
    branch: &str,
    settings: &GuardSettings,
) -> Result<(DiffSet, GuardReport)> {
    let base = merge_base(root, branch)?;
    let scope = DiffScope::Range(format!("{base}..{branch}"));
    let diff = diff_for_scope(root, &scope)?;
    let report = scan_diff(root, &diff, &GuardOptions::from_settings(scope, settings));
    Ok((diff, report))
}

pub fn scan_branch_with(
    root: &Path,
    branch: &str,
    settings: &GuardSettings,
) -> Result<GuardReport> {
    let merge_base = merge_base(root, branch)?;
    let options = GuardOptions::from_settings(
        DiffScope::Range(format!("{}..{}", merge_base, branch)),
        settings,
    );
    scan(root, &options)
}

pub fn merge_base(root: &Path, branch: &str) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["merge-base", "HEAD", branch])
        .output()
        .context("failed to run git merge-base")?;
    if !output.status.success() {
        bail!(
            "cannot find merge base for {branch}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    let base = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if base.is_empty() {
        bail!("no merge base between HEAD and {branch}");
    }
    Ok(base)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_ids_roundtrip_config_strings() {
        for id in CheckId::ALL {
            assert_eq!(CheckId::parse(id.as_str()), Some(id));
        }
        assert_eq!(CheckId::parse("nope"), None);
    }

    #[test]
    fn severity_orders_error_above_info() {
        assert!(Severity::Error > Severity::Warn);
        assert!(Severity::Warn > Severity::Info);
    }

    #[test]
    fn report_counts_findings_by_severity() {
        let report = GuardReport {
            version: 1,
            generated_at: Utc::now(),
            base: "a".into(),
            head: "b".into(),
            files: 1,
            additions: 1,
            deletions: 0,
            checks: vec!["secret".into()],
            findings: vec![
                GuardFinding::new(CheckId::Secret, Severity::Error, "a", Some(1), "x"),
                GuardFinding::new(CheckId::DebugLeftover, Severity::Info, "a", Some(2), "y"),
                GuardFinding::new(CheckId::LargeDiff, Severity::Warn, "a", None, "z"),
            ],
            passed: false,
        };
        assert_eq!(report.counts(), (1, 1, 1));
        assert!(report.has_errors());
    }

    #[test]
    fn options_respect_configured_checks_and_thresholds() {
        let settings = GuardSettings {
            checks: vec!["secret".into(), "bogus".into()],
            large_diff_files: 5,
            large_diff_lines: 50,
            ..GuardSettings::default()
        };
        let options = GuardOptions::from_settings(DiffScope::Staged, &settings);
        assert_eq!(options.checks, vec![CheckId::Secret]);
        assert_eq!(options.large_files, 5);
        assert_eq!(options.large_lines, 50);
    }
}
