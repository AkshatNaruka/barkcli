//! `barkcli guard` — deterministic pre-merge scan.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

use crate::guard::diff::DiffScope;
use crate::guard::{self, CheckId, GuardOptions, GuardReport};
use crate::models::config::GuardSettings;
use crate::models::Config;
use crate::storage::board_dir::find_board_dir_opt;
use crate::storage::config_store::read_config;

#[derive(Debug, Default)]
struct GuardArgs {
    json: bool,
    strict: bool,
    branch: Option<String>,
    scope: Option<String>,
    range: Option<String>,
    checks: Option<Vec<String>>,
}

pub fn run_guard(args: &[String]) -> Result<()> {
    let parsed = GuardArgs::parse(args)?;
    let root = repo_root()?;
    let config = project_config();
    let settings = &config.guard;

    if !settings.enabled {
        println!("guard is disabled in .board/config.json (`guard.enabled = false`)");
        return Ok(());
    }

    let scope = if let Some(branch) = &parsed.branch {
        guard::branch_scope(&root, branch)
    } else if let Some(range) = &parsed.range {
        DiffScope::Range(range.clone())
    } else {
        match parsed.scope.as_deref() {
            None | Some("worktree") => DiffScope::Worktree,
            Some("staged") => DiffScope::Staged,
            Some(other) => bail!("unknown scope `{other}` (use worktree|staged)"),
        }
    };

    let mut options = GuardOptions::from_settings(scope, settings);
    if let Some(checks) = &parsed.checks {
        let mut parsed_checks = Vec::new();
        for check in checks {
            match CheckId::parse(check) {
                Some(id) => parsed_checks.push(id),
                None => bail!("unknown check `{check}`"),
            }
        }
        if parsed_checks.is_empty() {
            bail!("--checks needs at least one check");
        }
        options.checks = parsed_checks;
    }

    let report = guard::scan(&root, &options)?;

    if parsed.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print!("{}", render_report(&report));
    }

    if blocks_merge(&report, settings.block, parsed.strict) {
        let (errors, warnings, _) = report.counts();
        bail!(
            "guard found {} error(s) and {} warning(s) — merge blocked ({})",
            errors,
            warnings,
            if settings.block && errors > 0 {
                "guard.block = true"
            } else {
                "--strict"
            }
        );
    }
    Ok(())
}

/// `guard.block` blocks errors; `--strict` also promotes warnings. Clean
/// reports never block, so strict CI stays green on a quiet diff.
fn blocks_merge(report: &GuardReport, block: bool, strict: bool) -> bool {
    let (errors, warnings, _) = report.counts();
    (block && errors > 0) || (strict && (errors > 0 || warnings > 0))
}

impl GuardArgs {
    fn parse(args: &[String]) -> Result<Self> {
        let mut parsed = Self::default();
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "--json" => parsed.json = true,
                "--strict" => parsed.strict = true,
                "--branch" => {
                    index += 1;
                    parsed.branch = Some(
                        args.get(index)
                            .context("--branch needs a branch name")?
                            .clone(),
                    );
                }
                "--scope" => {
                    index += 1;
                    parsed.scope = Some(args.get(index).context("--scope needs a value")?.clone());
                }
                "--range" => {
                    index += 1;
                    parsed.range = Some(
                        args.get(index)
                            .context("--range needs a revision range")?
                            .clone(),
                    );
                }
                "--checks" => {
                    index += 1;
                    let raw = args
                        .get(index)
                        .context("--checks needs comma-separated names")?;
                    parsed.checks = Some(
                        raw.split(',')
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string)
                            .collect(),
                    );
                }
                other if other.starts_with('-') => bail!("unknown guard flag `{other}`"),
                other => bail!("unexpected guard argument `{other}`"),
            }
            index += 1;
        }
        if parsed.branch.is_some() && (parsed.range.is_some() || parsed.scope.is_some()) {
            bail!("use either --branch or --range/--scope, not both");
        }
        Ok(parsed)
    }
}

/// Render the human report. Pure so it can be tested without a repo.
fn render_report(report: &GuardReport) -> String {
    let mut out = String::new();
    let (errors, warnings, infos) = report.counts();
    out.push_str(&format!(
        "guard  {} → {}  {} files  +{} -{}\n",
        report.base, report.head, report.files, report.additions, report.deletions
    ));

    if report.findings.is_empty() {
        out.push_str("clean — no findings\n");
        return out;
    }

    out.push('\n');
    for finding in &report.findings {
        let location = match finding.line {
            Some(line) => format!("{}:{}", finding.path, line),
            None => finding.path.clone(),
        };
        out.push_str(&format!(
            "{:<5} {:<22} {}\n",
            finding.severity.as_str().to_uppercase(),
            finding.check.as_str(),
            location
        ));
        out.push_str(&format!("      {}\n", finding.message));
        if let Some(evidence) = &finding.evidence {
            out.push_str(&format!("      evidence: {evidence}\n"));
        }
        if let Some(suggestion) = &finding.suggestion {
            out.push_str(&format!("      → {suggestion}\n"));
        }
    }

    let verdict = if report.has_errors() {
        "FAIL"
    } else if warnings > 0 {
        "PASS (warnings)"
    } else {
        "PASS"
    };
    out.push_str(&format!(
        "\n{} error(s), {} warning(s), {} info — {verdict}\n",
        errors, warnings, infos
    ));
    out
}

fn repo_root() -> Result<PathBuf> {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .context("failed to run git")?;
    if !output.status.success() {
        bail!("guard needs a git repository (run this inside one)");
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        bail!("could not resolve the git repository root");
    }
    Ok(PathBuf::from(path))
}

fn project_config() -> Config {
    find_board_dir_opt()
        .ok()
        .flatten()
        .and_then(|dir| read_config(&dir).ok())
        .unwrap_or_default()
}

/// Used by run-cmd integration: report path for a branch without re-parsing.
pub fn scan_for_branch(root: &Path, branch: &str, settings: &GuardSettings) -> Result<GuardReport> {
    guard::scan_branch_with(root, branch, settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::guard::Severity;
    use chrono::Utc;

    fn sample() -> GuardReport {
        GuardReport {
            version: 1,
            generated_at: Utc::now(),
            base: "HEAD".into(),
            head: "WORKTREE".into(),
            files: 2,
            additions: 10,
            deletions: 3,
            checks: vec!["secret".into()],
            findings: vec![
                guard::GuardFinding::new(
                    CheckId::Secret,
                    Severity::Error,
                    "src/db.rs",
                    Some(12),
                    "possible secret committed: openai_key",
                )
                .with_suggestion("rotate it"),
                guard::GuardFinding::new(
                    CheckId::MissingTests,
                    Severity::Warn,
                    "src/lib.rs",
                    None,
                    "no tests",
                ),
            ],
            passed: false,
        }
    }

    #[test]
    fn renders_findings_with_location_and_verdict() {
        let text = render_report(&sample());
        assert!(text.contains("ERROR secret"));
        assert!(text.contains("src/db.rs:12"));
        assert!(text.contains("WARN  missing_tests"));
        assert!(text.contains("1 error(s), 1 warning(s), 0 info — FAIL"));
    }

    #[test]
    fn renders_clean_report() {
        let mut report = sample();
        report.findings.clear();
        report.passed = true;
        let text = render_report(&report);
        assert!(text.contains("clean — no findings"));
    }

    #[test]
    fn parses_guard_flags() {
        let args = vec![
            "--json".to_string(),
            "--strict".to_string(),
            "--range".to_string(),
            "main..feat".to_string(),
            "--checks".to_string(),
            "secret,missing_tests".to_string(),
        ];
        let parsed = GuardArgs::parse(&args).unwrap();
        assert!(parsed.json);
        assert!(parsed.strict);
        assert_eq!(parsed.range.as_deref(), Some("main..feat"));
        assert_eq!(parsed.checks.unwrap(), vec!["secret", "missing_tests"]);
    }

    #[test]
    fn rejects_unknown_flags() {
        assert!(GuardArgs::parse(&["--nope".into()]).is_err());
    }

    #[test]
    fn rejects_branch_with_range() {
        let args = vec![
            "--branch".to_string(),
            "feat".to_string(),
            "--range".to_string(),
            "a..b".to_string(),
        ];
        assert!(GuardArgs::parse(&args).is_err());
    }

    #[test]
    fn blocking_follows_advisory_default_and_strict_promotion() {
        let mut report = sample();
        // Errors are advisory unless the project opts in.
        assert!(!blocks_merge(&report, false, false));
        assert!(blocks_merge(&report, true, false));

        // Warnings only block in strict mode.
        report.findings.retain(|f| f.severity == Severity::Warn);
        report.passed = true;
        assert!(!blocks_merge(&report, true, false));
        assert!(blocks_merge(&report, false, true));

        // A clean report never blocks.
        report.findings.clear();
        assert!(!blocks_merge(&report, true, true));
    }
}
