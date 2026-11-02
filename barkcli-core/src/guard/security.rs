//! DeepSec Security Acceptance Gate.
//!
//! Executes `deepsec` within a worktree before branch acceptance or PR merge.
//! Inspects the code for vulnerabilities, hardcoded secrets, injection vectors,
//! and unsafe dependency usage.

use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepsecFinding {
    pub severity: String,
    pub rule_id: String,
    pub message: String,
    pub file: Option<String>,
    pub line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepsecReport {
    pub tool_installed: bool,
    pub passed: bool,
    pub total_findings: usize,
    pub findings: Vec<DeepsecFinding>,
    pub summary: String,
}

/// Run deepsec security check in the given directory or worktree.
pub fn run_deepsec_scan(worktree: &Path) -> DeepsecReport {
    let which = Command::new("which").arg("deepsec").output();
    let has_deepsec = which.map(|o| o.status.success()).unwrap_or(false);

    if !has_deepsec {
        return DeepsecReport {
            tool_installed: false,
            passed: true,
            total_findings: 0,
            findings: Vec::new(),
            summary: "deepsec is not installed; security gate skipped. Install via `npm i -g deepsec`."
                .into(),
        };
    }

    let output = Command::new("deepsec")
        .arg("check")
        .arg("--json")
        .current_dir(worktree)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);

            if let Ok(findings) = serde_json::from_str::<Vec<DeepsecFinding>>(&stdout) {
                let critical_count = findings
                    .iter()
                    .filter(|f| f.severity.eq_ignore_ascii_case("error") || f.severity.eq_ignore_ascii_case("critical"))
                    .count();
                let passed = critical_count == 0;
                let summary = if passed {
                    format!("DeepSec audit passed with {} non-blocking warning(s).", findings.len())
                } else {
                    format!("DeepSec audit failed: {} critical vulnerability finding(s).", critical_count)
                };
                DeepsecReport {
                    tool_installed: true,
                    passed,
                    total_findings: findings.len(),
                    findings,
                    summary,
                }
            } else if out.status.success() {
                DeepsecReport {
                    tool_installed: true,
                    passed: true,
                    total_findings: 0,
                    findings: Vec::new(),
                    summary: if stdout.trim().is_empty() {
                        "DeepSec scan passed cleanly (0 vulnerabilities detected).".into()
                    } else {
                        stdout.trim().to_string()
                    },
                }
            } else {
                DeepsecReport {
                    tool_installed: true,
                    passed: false,
                    total_findings: 1,
                    findings: vec![DeepsecFinding {
                        severity: "error".into(),
                        rule_id: "scan_failure".into(),
                        message: if stderr.is_empty() { stdout.to_string() } else { stderr.to_string() },
                        file: None,
                        line: None,
                    }],
                    summary: "DeepSec scan reported security issues or exited with non-zero status.".into(),
                }
            }
        }
        Err(e) => DeepsecReport {
            tool_installed: true,
            passed: false,
            total_findings: 1,
            findings: vec![DeepsecFinding {
                severity: "error".into(),
                rule_id: "execution_error".into(),
                message: format!("Failed to spawn deepsec process: {}", e),
                file: None,
                line: None,
            }],
            summary: format!("Failed to run deepsec: {}", e),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uninstalled_deepsec_gracefully_skips() {
        let temp = std::env::temp_dir();
        let report = run_deepsec_scan(&temp);
        if !report.tool_installed {
            assert!(report.passed);
            assert!(report.summary.contains("deepsec is not installed"));
        }
    }
}
