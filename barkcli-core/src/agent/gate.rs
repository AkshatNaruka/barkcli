//! Gate v2: multi-step verification with caching, retry, and evidence.
//!
//! The gate is the acceptance contract for a worktree: `VerifyProfile` steps
//! run in a worktree cwd; a head-SHA cache avoids re-running when the work
//! is unchanged; a flaky step retries once; per-step tails are evidence.

use std::path::{Path, PathBuf};
use std::time::Instant;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::agent::verify::{detect_profile_in, VerifyProfile, VerifyStep};

/// Gate outcome for one run/check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateVerdict {
    pub passed: bool,
    pub steps: Vec<StepEvidence>,
    pub head_sha: String,
    pub target_head: String,
    pub cached: bool,
    pub duration_ms: u64,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepEvidence {
    pub name: String,
    pub cmd: Vec<String>,
    pub success: bool,
    pub skipped: bool,
    pub attempts: u32,
    pub duration_ms: u64,
    pub tail: Vec<String>,
}

/// Gate configuration (stored at `.board/gate.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateConfig {
    #[serde(default)]
    pub retry_flaky: u32,
    #[serde(default = "default_true")]
    pub cache_enabled: bool,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
}

impl Default for GateConfig {
    fn default() -> Self {
        Self {
            retry_flaky: 1,
            cache_enabled: true,
            timeout_secs: 600,
        }
    }
}

fn default_true() -> bool {
    true
}
fn default_timeout_secs() -> u64 {
    600
}

pub fn gate_path() -> Result<PathBuf> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    Ok(board_dir.join("gate.json"))
}

pub fn load_gate_config() -> GateConfig {
    gate_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_gate_config(cfg: &GateConfig) -> Result<()> {
    let path = gate_path()?;
    let json = serde_json::to_string_pretty(cfg)?;
    std::fs::write(path, json).context("failed to write gate.json")?;
    Ok(())
}

/// Profile used for a gate: explicit override, else verify.json, else detection.
pub fn resolve_profile(worktree: &Path, override_cmd: Option<&str>) -> VerifyProfile {
    if let Some(cmd) = override_cmd.map(str::trim).filter(|c| !c.is_empty()) {
        return VerifyProfile {
            steps: vec![VerifyStep {
                name: "gate".into(),
                cmd: vec!["sh".into(), "-c".into(), cmd.to_string()],
            }],
        };
    }
    if let Ok(profile) = crate::agent::verify::load_profile() {
        if !profile.steps.is_empty() {
            return profile;
        }
    }
    detect_profile_in(worktree)
}

/// Run gate steps in `cwd`. Supports cache + retry.
pub fn run_gate_v2(
    profile: &VerifyProfile,
    cwd: &Path,
    head_sha: &str,
    target_head: &str,
    cache_dir: Option<&Path>,
    cfg: &GateConfig,
) -> GateVerdict {
    let start = Instant::now();
    // Cache lookup: same head+target with prior passed marker → skip.
    if cfg.cache_enabled {
        if let Some(dir) = cache_dir {
            let key = cache_key(head_sha, target_head, profile);
            let marker = dir.join(format!("gate-{}.passed", key));
            if marker.exists() {
                return GateVerdict {
                    passed: true,
                    steps: vec![StepEvidence {
                        name: "cache".into(),
                        cmd: vec![],
                        success: true,
                        skipped: true,
                        attempts: 0,
                        duration_ms: 0,
                        tail: vec!["cached: head unchanged".into()],
                    }],
                    head_sha: head_sha.to_string(),
                    target_head: target_head.to_string(),
                    cached: true,
                    duration_ms: start.elapsed().as_millis() as u64,
                    summary: "Gate cached (head unchanged)".into(),
                };
            }
        }
    }

    let mut steps = Vec::new();
    let mut all_passed = true;
    for step in &profile.steps {
        let evidence = run_step(step, cwd, cfg);
        if !evidence.success && !evidence.skipped {
            all_passed = false;
        }
        steps.push(evidence);
    }
    if profile.steps.is_empty() {
        all_passed = true;
    }
    if all_passed {
        if cfg.cache_enabled {
            if let Some(dir) = cache_dir {
                let _ = std::fs::create_dir_all(dir);
                let key = cache_key(head_sha, target_head, profile);
                let _ = std::fs::write(dir.join(format!("gate-{}.passed", key)), "ok");
            }
        }
    }
    let summary = if all_passed {
        format!("Gate passed: {} step(s)", steps.len())
    } else {
        let failed = steps
            .iter()
            .filter(|s| !s.success && !s.skipped)
            .map(|s| s.name.clone())
            .collect::<Vec<_>>()
            .join(", ");
        format!("Gate failed: {}", failed)
    };
    GateVerdict {
        passed: all_passed,
        steps,
        head_sha: head_sha.to_string(),
        target_head: target_head.to_string(),
        cached: false,
        duration_ms: start.elapsed().as_millis() as u64,
        summary,
    }
}

fn cache_key(head: &str, target: &str, profile: &VerifyProfile) -> String {
    let mut h = format!("{}:{}", head, target);
    for s in &profile.steps {
        h.push_str(&format!("|{}:{}", s.name, s.cmd.join(" ")));
    }
    crate::util::slug::to_slug(&h)
}

fn run_step(step: &VerifyStep, cwd: &Path, cfg: &GateConfig) -> StepEvidence {
    let max_attempts = 1 + cfg.retry_flaky;
    let mut last_tail: Vec<String> = Vec::new();
    let mut attempts = 0u32;
    let start = Instant::now();
    for attempt in 1..=max_attempts {
        attempts = attempt;
        let Some((cmd, args)) = step.cmd.split_first() else {
            return StepEvidence {
                name: step.name.clone(),
                cmd: step.cmd.clone(),
                success: false,
                skipped: false,
                attempts: 1,
                duration_ms: 0,
                tail: vec!["empty command".into()],
            };
        };
        let output = std::process::Command::new(cmd).args(args).current_dir(cwd).output();
        match output {
            Err(e) => {
                // Missing tool → skipped (like legacy verify.rs).
                return StepEvidence {
                    name: step.name.clone(),
                    cmd: step.cmd.clone(),
                    success: false,
                    skipped: true,
                    attempts,
                    duration_ms: start.elapsed().as_millis() as u64,
                    tail: vec![format!("skipped (tool missing): {}", e)],
                };
            }
            Ok(o) => {
                let combined = format!(
                    "{}{}",
                    String::from_utf8_lossy(&o.stdout),
                    String::from_utf8_lossy(&o.stderr)
                );
                let lines: Vec<String> = combined.lines().map(|l| l.to_string()).collect();
                last_tail = if lines.len() > 30 {
                    lines[lines.len() - 30..].to_vec()
                } else {
                    lines
                };
                if o.status.success() {
                    return StepEvidence {
                        name: step.name.clone(),
                        cmd: step.cmd.clone(),
                        success: true,
                        skipped: false,
                        attempts,
                        duration_ms: start.elapsed().as_millis() as u64,
                        tail: last_tail,
                    };
                }
                // else retry if attempts remain
            }
        }
    }
    StepEvidence {
        name: step.name.clone(),
        cmd: step.cmd.clone(),
        success: false,
        skipped: false,
        attempts,
        duration_ms: start.elapsed().as_millis() as u64,
        tail: last_tail,
    }
}

/// Integration helper for `RunService::check`: derive head/target and run v2.
pub fn check_worktree(
    worktree: &Path,
    override_cmd: Option<&str>,
) -> Result<GateVerdict> {
    let root = crate::storage::board_dir::find_project_root()?;
    let target_head = git_out(&root, &["rev-parse", "HEAD"])?;
    let head_sha = git_out(worktree, &["rev-parse", "HEAD"])?;
    let profile = resolve_profile(worktree, override_cmd);
    let cfg = load_gate_config();
    let board_dir = crate::storage::board_dir::find_board_dir().ok();
    let cache_dir = board_dir.map(|d| d.join("gate-cache"));
    Ok(run_gate_v2(
        &profile,
        worktree,
        &head_sha,
        &target_head,
        cache_dir.as_deref(),
        &cfg,
    ))
}

fn git_out(root: &Path, args: &[&str]) -> Result<String> {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .context("git failed to start")?;
    if !out.status.success() {
        anyhow::bail!("git {} failed: {}", args.join(" "), String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_stable() {
        let profile = VerifyProfile {
            steps: vec![VerifyStep { name: "test".into(), cmd: vec!["true".into()] }],
        };
        let a = cache_key("abc", "def", &profile);
        let b = cache_key("abc", "def", &profile);
        assert_eq!(a, b);
        let c = cache_key("xyz", "def", &profile);
        assert_ne!(a, c);
    }

    #[test]
    fn empty_profile_gate_passes() {
        let profile = VerifyProfile { steps: vec![] };
        let v = run_gate_v2(&profile, std::path::Path::new("/tmp"), "h", "t", None, &GateConfig::default());
        assert!(v.passed);
    }

    #[test]
    fn gate_config_defaults() {
        let cfg = GateConfig::default();
        assert_eq!(cfg.retry_flaky, 1);
        assert!(cfg.cache_enabled);
    }
}
