use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// One verification step: a named command to run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyStep {
    pub name: String,
    pub cmd: Vec<String>,
}

/// Per-board verification profile: how this repo validates work (P5).
/// Stored at `.board/verify.json`. Agents must never guess — read this.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VerifyProfile {
    #[serde(default)]
    pub steps: Vec<VerifyStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub name: String,
    pub cmd: Vec<String>,
    pub success: bool,
    pub duration_ms: u64,
    /// Last ~30 lines of combined output.
    pub tail: Vec<String>,
    /// Skipped when the step's files/tools are absent.
    pub skipped: bool,
}

pub fn verify_path() -> Result<PathBuf> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    Ok(board_dir.join("verify.json"))
}

pub fn load_profile() -> Result<VerifyProfile> {
    let path = verify_path()?;
    if !path.exists() {
        return Ok(detect_profile()?);
    }
    let json = std::fs::read_to_string(&path).context("Failed to read verify.json")?;
    Ok(serde_json::from_str(&json)?)
}

pub fn save_profile(profile: &VerifyProfile) -> Result<()> {
    let path = verify_path()?;
    let json = serde_json::to_string_pretty(profile)?;
    std::fs::write(&path, json).context("Failed to write verify.json")?;
    Ok(())
}

/// Detect a sensible profile from project files (used when verify.json is absent).
pub fn detect_profile() -> Result<VerifyProfile> {
    let root = crate::storage::board_dir::find_project_root()?;
    Ok(detect_profile_in(&root))
}

pub fn detect_profile_in(root: &Path) -> VerifyProfile {
    let mut steps = Vec::new();
    if root.join("Cargo.toml").exists() {
        steps.push(VerifyStep {
            name: "test".into(),
            cmd: vec!["cargo".into(), "test".into(), "--quiet".into()],
        });
        steps.push(VerifyStep {
            name: "clippy".into(),
            cmd: vec![
                "cargo".into(),
                "clippy".into(),
                "--quiet".into(),
                "--".into(),
                "-D".into(),
                "warnings".into(),
            ],
        });
    } else if root.join("package.json").exists() {
        steps.push(VerifyStep {
            name: "test".into(),
            cmd: vec!["npm".into(), "test".into(), "--silent".into()],
        });
        steps.push(VerifyStep {
            name: "build".into(),
            cmd: vec!["npm".into(), "run".into(), "build".into()],
        });
    } else if root.join("pyproject.toml").exists() || root.join("setup.py").exists() {
        steps.push(VerifyStep {
            name: "test".into(),
            cmd: vec!["pytest".into(), "-q".into()],
        });
    } else if root.join("go.mod").exists() {
        steps.push(VerifyStep {
            name: "test".into(),
            cmd: vec!["go".into(), "test".into(), "./...".into()],
        });
    }
    VerifyProfile { steps }
}

/// Run the profile in `cwd`, capturing structured results.
pub fn run_profile(profile: &VerifyProfile, cwd: &Path) -> Vec<StepResult> {
    profile
        .steps
        .iter()
        .map(|step| {
            let start = Instant::now();
            let (cmd, args) = match step.cmd.split_first() {
                Some((c, a)) => (c.clone(), a.to_vec()),
                None => {
                    return StepResult {
                        name: step.name.clone(),
                        cmd: step.cmd.clone(),
                        success: false,
                        duration_ms: 0,
                        tail: vec!["empty command".to_string()],
                        skipped: false,
                    }
                }
            };
            let out = Command::new(&cmd).args(&args).current_dir(cwd).output();
            match out {
                Ok(o) => {
                    let mut combined = String::from_utf8_lossy(&o.stdout).into_owned();
                    combined.push_str(&String::from_utf8_lossy(&o.stderr));
                    let lines: Vec<String> =
                        combined.lines().map(|l| l.to_string()).collect();
                    let tail = if lines.len() > 30 {
                        lines[lines.len() - 30..].to_vec()
                    } else {
                        lines
                    };
                    StepResult {
                        name: step.name.clone(),
                        cmd: step.cmd.clone(),
                        success: o.status.success(),
                        duration_ms: start.elapsed().as_millis() as u64,
                        tail,
                        skipped: false,
                    }
                }
                Err(e) => StepResult {
                    name: step.name.clone(),
                    cmd: step.cmd.clone(),
                    success: false,
                    duration_ms: start.elapsed().as_millis() as u64,
                    tail: vec![format!("failed to run: {}", e)],
                    skipped: true,
                },
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_cargo_profile() {
        let dir = std::env::temp_dir().join(format!("bark-verify-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname = \"x\"\n").unwrap();
        let profile = detect_profile_in(&dir);
        assert!(profile.steps.iter().any(|s| s.name == "test"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_run_empty_profile() {
        let profile = VerifyProfile { steps: vec![] };
        let results = run_profile(&profile, &std::env::temp_dir());
        assert!(results.is_empty());
    }
}
